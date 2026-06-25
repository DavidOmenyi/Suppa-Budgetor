// netlify/functions/get-insights.js
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) };
    }

    try {
        const payload = JSON.parse(event.body);
        const allTransactions = payload.transactions || [];

        // 1. Get only Expenses from the last 60 entries to keep the AI prompt small and fast
        const recentExpenses = allTransactions
            .filter(t => t.type === 'Expense')
            .sort((a, b) => new Date(b.date) - new Date(a.date)) // Newest first
            .slice(0, 60) 
            .map(t => `${t.date}: ${t.category} - ${t.name} (KES ${t.kes})`)
            .join('\n');

        if (!recentExpenses || recentExpenses.length === 0) {
             return { statusCode: 200, body: JSON.stringify({ success: true, insights: "You haven't logged any recent expenses yet. Start tracking your budget to get AI advice!" }) };
        }

        // 2. Instruct the AI on how to analyze the data
        const prompt = `You are an expert financial advisor specializing in Kenyan budgets. Analyze the following recent expenses. 
        Provide 3 short, highly specific, and actionable bullet points to help the user identify spending leaks and save money. Do not write a long intro or conclusion, just give the 3 insights.
        
        Expenses:\n${recentExpenses}`;

        // 3. Call the Google Gemini API (Ensure GEMINI_API_KEY is in your Netlify Environment Variables)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // Catch Google API errors
        if (!response.ok || !data.candidates) {
            console.error("Google API Error:", JSON.stringify(data));
            throw new Error("AI provider returned an error.");
        }

        const aiText = data.candidates[0].content.parts[0].text;

        return { 
            statusCode: 200, 
            body: JSON.stringify({ success: true, insights: aiText }) 
        };

    } catch (error) {
        console.error("AI Function Failed:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ success: false, message: error.message }) 
        };
    }
};
