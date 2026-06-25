const TIMEOUT = 15000; // example, not used but left for future use

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

        // 2. Prepare AI Prompt
        const prompt = `You are an expert financial advisor specializing in Kenyan budgets. Analyze the following recent expenses. 
Provide 3 short, highly specific, and actionable bullet points to help the user identify spending leaks and save money. Do not write a long intro or conclusion, just give the 3 insights formatted clearly.

Expenses:
${recentExpenses}`;

        // 3. Call the Google Gemini API (using global fetch available in Node 18+)
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
