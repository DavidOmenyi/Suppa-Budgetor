const { createClient } = require('@supabase/supabase-js');

// Look for standard keys, fallback to REACT_APP_ keys if standard are missing
const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.REACT_APP_SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ FATAL: Missing Supabase URL or Key in environment variables!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body);
    console.log("DEBUG: Received Payload:", JSON.stringify(payload, null, 2));

    const checkoutRequestId = payload.checkout_request_id;

    if (payload.result_code !== 0) {
      console.log(`❌ Transaction Failed: ${payload.result_desc || 'No description'}`);
      return { statusCode: 200, body: 'Acknowledged failure' };
    }

    console.log(`✅ Transaction Successful! Searching for ID: ${checkoutRequestId}`);

    // Update the profile
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_premium: true })
      .eq('checkout_request_id', checkoutRequestId);

    if (error) {
      console.error("❌ SUPABASE UPDATE ERROR:", error);
      return { statusCode: 500, body: 'Database update failed' };
    }

    console.log("🎉 User unlocked successfully!");
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error("❌ CALLBACK CRASHED:", error);
    return { statusCode: 500, body: 'Internal Error' };
  }
};
