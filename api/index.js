// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// Env vars are set in Vercel Dashboard -> Settings -> Environment Variables.
const { createClient } = require('@supabase/supabase-js');
const { createApp } = require('../server/app');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const app = createApp(supabase);

module.exports = (req, res) => app(req, res);
