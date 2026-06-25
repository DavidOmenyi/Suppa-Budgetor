const TIMEOUT = 15000; // example, not used but left for future use

// In-memory cache for storing AI insights
// Format: { cacheKey: { insights: string, timestamp: number } }
const insightsCache = {};
const CACHE_DURATION = 60 * 60 * 1000; // Cache for 1 hour (in milliseconds)

/**
 * Generate a cache key from transactions
 * Uses a hash of sorted transaction data to ensure consistency
 */
function generateCacheKey(transactions) {
    const sortedTransactions = transactions
        .slice()
        .sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            if (a.name !== b.name) return a.name.localeCompare(b.name);
            return a.kes - b.kes;
        });
    
    // Create a simple hash-like key from the transaction data
    return Buffer.from(JSON.stringify(sortedTransactions)).toString('base64');
}

/**
 * Check if cached insights are still valid
 */
function getCachedInsights(cacheKey) {
    if (insightsCache[cacheKey]) {
        const cached = insightsCache[cacheKey];
        const age = Date.now() - cached.timestamp;
        
        // Return cached data if still within duration
        if (age < CACHE_DURATION) {
            console.log(`Cache HIT - Insights served from cache (age: ${Math.round(age / 1000)}s)`);
            return cached.insights;
        } else {
            // Remove expired cache entry
            delete insightsCache[cacheKey];
            console.log('Cache expired, will fetch fresh insights');
        }
    }
    return null;
}

/**
 * Store insights in cache
 */
function setCachedInsights(cacheKey, insights) {
    insightsCache[cacheKey] = {
        insights: insights,
        timestamp: Date.now()
    };
    console.log(`Cache SET - New insights cached`);
}

/**
 * Clear old cache entries if cache grows too large
 * Keep only the most recent 50 entries to prevent memory issues
 */
function pruneCache() {
    const keys = Object.keys(insightsCache);
    if (keys.length > 50) {
        const sortedByTime = keys.sort((a, b) => 
            insightsCache[a].timestamp - insightsCache[b].timestamp
        );
        
        // Remove oldest entries, keeping only 50
        for (let i = 0; i < sortedByTime.length - 50; i++) {
            delete insightsCache[sortedByTime[i]];
        }
        console.log(`Cache pruned - Removed ${sortedByTime.length - 50} old entries`);
    }
}

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ success: false, message: "Method Not Allowed" })
        };
    }

    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: "No request body" })
            };
        }

        let payload;
        try {
            payload = JSON.parse(event.body);
        } catch (parseErr) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: "Invalid JSON body" })
            };
        }

        const allTransactions = Array.isArray(payload.transactions) ? payload.transactions : [];

        // 1. Get only Expenses
        const recentExpenses = allTransactions
            .filter(t => t && t.type === 'Expense')
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 60)
            .map(t => `${t.date}: ${t.category} - ${t.name} (KES ${t.kes})`)
            .join('\n');

        if (!recentExpenses || recentExpenses.length === 0) {
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, insights: "You haven't logged any recent expenses yet. Start tracking your budget to get AI advice!" })
            };
        }

        // 2. Check cache before making API call
        const expenseTransactions = allTransactions.filter(t => t && t.type === 'Expense');
        const cacheKey = generateCacheKey(expenseTransactions);
        
        const cachedInsights = getCachedInsights(cacheKey);
        if (cachedInsights) {
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true, insights: cachedInsights })
            };
        }

        // 3. Prepare AI Prompt
        const prompt = `You are an expert financial advisor specializing in Kenyan budgets. Analyze the following recent expenses. 
Provide 3 short, highly specific, and actionable bullet points to help the user identify spending leaks and save money. Do not write a long intro or conclusion, just give the 3 insights formatted clearly.

Expenses:
${recentExpenses}`;

        // 4. Call the Google Gemini API (using global fetch available in Node 18+)
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("Missing GEMINI_API_KEY");
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, message: "AI API key not configured" })
            };
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json().catch(err => {
            console.error("Failed reading response JSON:", err);
            return null;
        });

        if (!response.ok || !data || !data.candidates) {
            console.error("Google API Error:", JSON.stringify(data));
            throw new Error("AI provider returned an error.");
        }

        const aiText = (data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';

        // 5. Cache the insights before returning
        setCachedInsights(cacheKey, aiText);
        
        // 6. Prune cache if it gets too large
        pruneCache();

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, insights: aiText })
        };

    } catch (error) {
        console.error("AI Function Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: error && error.message ? error.message : 'Unknown error' })
        };
    }
};
