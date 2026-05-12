import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Allow only POST requests
export default async function handler(req, res) {
  // Basic CORS — allow your domain to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    // Basic validation
    if (!data.email || !data.phone || !data.first_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert into Supabase
    const { data: inserted, error } = await supabase
      .from('Leads')
      .insert([
        {
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          email: data.email || null,
          phone: data.phone || null,
          zipcode: data.zipcode || null,
          city: data.city || null,
          state: data.state || null,
          dob: data.dob || null,
          health_history: data.health_history || null,
          mortgage_balance: data.mortgage_balance || null,
          monthly_payment: data.monthly_payment || null,
          beneficiary: data.beneficiary || null,
          beneficiary_name: data.beneficiary_name || null,
          contact_method: data.contact_method || null,
          utm_source: data.utm_source || null,
          utm_medium: data.utm_medium || null,
          utm_campaign: data.utm_campaign || null,
          utm_content: data.utm_content || null,
          utm_term: data.utm_term || null,
          campaign_id: data.campaign_id || null,
          adset_id: data.adset_id || null,
          ad_id: data.ad_id || null
        }
      ])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to save lead', details: error.message });
    }

    return res.status(200).json({ success: true, lead_id: inserted[0]?.id });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
