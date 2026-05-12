import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CLOSE_API_KEY = process.env.CLOSE_API_KEY;
const CLOSE_API_BASE = 'https://api.close.com/api/v1';

// New Lead status ID for LIFE - New Lead
const CLOSE_STATUS_NEW_LEAD = 'stat_obEZOGm97U0tI01w4KQj1w7n3byouEomUz0pL1ZQG00';

// Custom field IDs (from your Close org)
const CF = {
  DOB: 'cf_DbWRyPGaLsbjLzvMInpceHJiTHnYUU9PJVUw3D1SMGV',
  MORTGAGE_BALANCE: 'cf_ocaaBQqQjxNrn6mVPOhFa96BwxniUQd1oseSRVwYZPH',
  MONTHLY_PAYMENT: 'cf_gKhyIatqzQn1LNwzBM19LLsaSi01M1ZZufgigd0xdEg',
  BENEFICIARY_NAME: 'cf_CCC5S9uTBAEND2UnyXXyqs0Zvwk0J4gXDvrrrKBNsIO',
  BENEFICIARY_RELATIONSHIP: 'cf_fH8HVAsYHmLHNz55RctHvTCSZmPZ0wa524QBfHjIoC0',
  HEALTH_HISTORY: 'cf_uQ204c0Z2T3cgsCtsiSrF42Q6xYWaLFs7NesaBOWEsr',
  SUBMITTED_AT: 'cf_9BAOQpURoi7uv2Lud9eojJr2obJNWhDcsjaOjYCSd2d',
  RESIDENT_STATE: 'cf_ZhQrDRhpoq5QVGrHsTpWPYYDk1Ac1de0npusbYmlrNz',
  LEAD_SOURCE: 'cf_nSKTOdkB2kdb9G6JMphBjUZdSFThmrgP9RIp73A4fKL',
  UTM_CAMPAIGN: 'cf_gLZM2ZsVCZ9LCMoQ0fBJrbpMQLXVqgj1j67LKSCL5c4',
  UTM_CONTENT: 'cf_PXPT9fpJDKxoMXRqDNNgLVbV7z08xIAqbhw8eQAaojC',
  NOTES: 'cf_2hGOI9LkE669LYmbQDQuUVvgiZ8r15JQFXco2vXz7sW',
  CLIENT_TYPE: 'cf_Q4ybraypRaJblIR2cXICNPWfqt6s9AjlOYJJufb2wiZ'
};

// Format phone to E.164 for Close dialer compatibility: (555) 123-4567 -> +15551234567
function formatPhoneE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return phone; // fallback if format unexpected
}

// Convert MM / DD / YYYY -> YYYY-MM-DD for Close's date field
function formatDob(dob) {
  if (!dob) return null;
  const m = dob.match(/^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

// Convert full state name to 2-letter abbreviation (Close expects abbreviations)
// The zippopotam.us API returns full names like "Florida", but Close stores "FL"
const STATE_ABBR = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
  'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
  'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
  'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
  'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
  'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  'District of Columbia':'DC','Puerto Rico':'PR'
};
function toStateAbbr(state) {
  if (!state) return null;
  // If already a 2-letter code, return as-is uppercased
  if (state.length === 2) return state.toUpperCase();
  // Look up by exact match, then case-insensitive fallback
  if (STATE_ABBR[state]) return STATE_ABBR[state];
  const normalized = Object.keys(STATE_ABBR).find(
    k => k.toLowerCase() === state.toLowerCase()
  );
  return normalized ? STATE_ABBR[normalized] : null;
}

// Build a readable notes string with anything that doesn't fit cleanly into a custom field
function buildNotes(data) {
  const lines = [];
  if (data.contact_method) lines.push(`Preferred contact method: ${data.contact_method}`);
  if (data.utm_source) lines.push(`UTM Source: ${data.utm_source}`);
  if (data.utm_medium) lines.push(`UTM Medium: ${data.utm_medium}`);
  if (data.utm_term) lines.push(`UTM Term: ${data.utm_term}`);
  if (data.campaign_id) lines.push(`Campaign ID: ${data.campaign_id}`);
  if (data.adset_id) lines.push(`Adset ID: ${data.adset_id}`);
  if (data.ad_id) lines.push(`Ad ID: ${data.ad_id}`);
  return lines.join('\n');
}

async function pushToClose(data) {
  if (!CLOSE_API_KEY) {
    console.warn('CLOSE_API_KEY not set, skipping Close push');
    return { skipped: true };
  }

  const firstName = (data.first_name || '').trim();
  const lastName = (data.last_name || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
  const phoneE164 = formatPhoneE164(data.phone);
  const dobFormatted = formatDob(data.dob);
  const stateAbbr = toStateAbbr(data.state);

  // Build the lead payload
  const leadPayload = {
    name: `${lastName || 'Unknown'}, ${firstName || ''} - Mortgage Protection`.trim().replace(/,\s*-/, ' -'),
    status_id: CLOSE_STATUS_NEW_LEAD,
    contacts: [
      {
        name: fullName,
        emails: data.email ? [{ email: data.email, type: 'office' }] : [],
        phones: phoneE164 ? [{ phone: phoneE164, type: 'mobile' }] : []
      }
    ],
    addresses: (data.zipcode || data.city || data.state) ? [
      {
        label: 'home',
        city: data.city || '',
        state: stateAbbr || '',
        zipcode: data.zipcode || '',
        country: 'US'
      }
    ] : [],
    // Custom fields
    [`custom.${CF.LEAD_SOURCE}`]: 'Mortgage Protection LP',
    [`custom.${CF.CLIENT_TYPE}`]: 'Life Insurance',
    [`custom.${CF.SUBMITTED_AT}`]: new Date().toISOString(),
    ...(dobFormatted && { [`custom.${CF.DOB}`]: dobFormatted }),
    ...(data.mortgage_balance && { [`custom.${CF.MORTGAGE_BALANCE}`]: data.mortgage_balance }),
    ...(data.monthly_payment && { [`custom.${CF.MONTHLY_PAYMENT}`]: data.monthly_payment }),
    ...(data.beneficiary && { [`custom.${CF.BENEFICIARY_RELATIONSHIP}`]: data.beneficiary }),
    ...(data.beneficiary_name && { [`custom.${CF.BENEFICIARY_NAME}`]: data.beneficiary_name }),
    ...(data.health_history && { [`custom.${CF.HEALTH_HISTORY}`]: data.health_history }),
    ...(stateAbbr && { [`custom.${CF.RESIDENT_STATE}`]: stateAbbr }),
    ...(data.utm_campaign && { [`custom.${CF.UTM_CAMPAIGN}`]: data.utm_campaign }),
    ...(data.utm_content && { [`custom.${CF.UTM_CONTENT}`]: data.utm_content })
  };

  const notesText = buildNotes(data);
  if (notesText) {
    leadPayload[`custom.${CF.NOTES}`] = notesText;
  }

  // Basic Auth: API key as username, blank password, base64 encoded
  const auth = Buffer.from(`${CLOSE_API_KEY}:`).toString('base64');

  const response = await fetch(`${CLOSE_API_BASE}/lead/`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(leadPayload)
  });

  const responseBody = await response.json();

  if (!response.ok) {
    console.error('Close API error:', response.status, responseBody);
    throw new Error(`Close API ${response.status}: ${JSON.stringify(responseBody)}`);
  }

  return { lead_id: responseBody.id, success: true };
}

async function saveToSupabase(data) {
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
    throw new Error(`Supabase: ${error.message}`);
  }

  return { lead_id: inserted[0]?.id, success: true };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;

    // Basic validation
    if (!data.email || !data.phone || !data.first_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Write to Supabase + Close in parallel
    // Supabase is the source of truth — must succeed
    // Close is the workflow trigger — log errors but don't fail the user
    const [supabaseResult, closeResult] = await Promise.allSettled([
      saveToSupabase(data),
      pushToClose(data)
    ]);

    // If Supabase failed, return a 500 since we lost the lead
    if (supabaseResult.status === 'rejected') {
      console.error('Supabase write failed:', supabaseResult.reason);
      return res.status(500).json({
        error: 'Failed to save lead',
        details: supabaseResult.reason?.message
      });
    }

    // If Close failed, log it but still return success — lead is safe in Supabase
    if (closeResult.status === 'rejected') {
      console.error('Close push failed (lead still saved to Supabase):', closeResult.reason);
    } else {
      console.log('Lead created in Close:', closeResult.value?.lead_id);
    }

    return res.status(200).json({
      success: true,
      supabase_id: supabaseResult.value?.lead_id,
      close_id: closeResult.status === 'fulfilled' ? closeResult.value?.lead_id : null,
      close_status: closeResult.status
    });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
