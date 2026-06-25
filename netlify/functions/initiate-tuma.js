const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase to save the tracking ID
const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// netlify/functions/initiate-tuma.js
exports.handler = async (event, context) => {
    try {
        // 1. Only allow POST requests
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                body: JSON.stringify({ success: false, message: "Method Not Allowed" })
            };
        }

        // 2. Parse the body sent from the frontend
        const payload = JSON.parse(event.body);
        const amount = payload.amount;
        const phone = payload.phone;
        const userId = payload.userId; // Ensure your frontend passes this!

        // 3. Get Authentication Token
        const authRes = await fetch('https://api.tuma.co.ke/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.TUMA_EMAIL,
                api_key: process.env.TUMA_API_KEY
            })
        });

        const authData = await authRes.json();

        if (!authData.success || !authData.data || !authData.data.token) {
            throw new Error("Tuma Auth Failed: Token missing in response");
        }

        const token = authData.data.token;

        // 4. Trigger Payment
        const paymentRes = await fetch('https://api.tuma.co.ke/payment/stk-push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                amount: amount || 1500.00,
                phone: phone,
                callback_url: process.env.MY_NETLIFY_WEBHOOK_URL, // Added process.env here
                description: "Suppa Budgetor Premium Upgrade"
            })
        });

        const paymentData = await paymentRes.json();

        if (paymentData.success && paymentData.data) {
            const checkoutId = paymentData.data.checkout_request_id;
            console.log(`DEBUG: Attempting to save CheckoutID: ${checkoutId} for UserID: ${userId}`);

            // 5. UPSERT: Create the row if it doesn't exist, or update it if it does!
            const { data, error } = await supabase
                .from('profiles')
                .upsert({ 
                    id: userId, 
                    checkout_request_id: checkoutId 
                });

            if (error) {
                console.error("❌ CRITICAL ERROR SAVING TO DB:", error);
                throw new Error("Database save failed");
            } else {
                console.log("✅ Successfully updated DB row for user!");
            }

            return { 
                statusCode: 200, 
                body: JSON.stringify(paymentData) 
            };
        } else {
            throw new Error(paymentData.message || "Payment request failed");
        }

    } catch (error) {
        // CRITICAL: Ensure even errors return valid JSON
        console.error("❌ Backend Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                success: false, 
                message: error.message 
            })
        };
    }
};
