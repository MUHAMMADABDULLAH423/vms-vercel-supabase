// Local dev server: serves the built React app + the same /api as Vercel.
// Env (in .env, never committed): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { createApp } = require('./app');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env and fill them from Supabase Dashboard -> Settings -> API.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const app = createApp(supabase);

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`VMS (Supabase) running at http://localhost:${PORT}`));
