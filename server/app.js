// Shared Express API for the Vercel + Supabase VMS.
// Used both by server/server.js (local dev) and api/index.js (Vercel serverless).
// The browser NEVER talks to Supabase directly: only this API uses the
// SERVICE ROLE key, so RLS can stay locked down on the table.
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');

const CATEGORIES = ['GENERAL VISITOR', 'VENDOR / SUPPLIER', 'DELIVERY', 'EMPLOYEE / INTER-UNIT', 'CONTRACTOR / SERVICE'];
const REASONS = ['Meeting Visitor (General)', 'Conference / Seminar', 'Goods Delivery', 'Internship Candidate', 'Employee Guest', 'Maintenance or Service', 'Job Interview', 'Third Party Contractor/Service Provider', 'Lunch Delivery (at Reception)', 'Civil Construction Work'];
const BUCKET = 'visitor-photos';

// Pakistan time (UTC+5, no daylight saving) — used for "today" everywhere.
function pktDate(d = new Date()) {
  return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}
function nowIso() { return new Date().toISOString(); }

function createApp(supabase) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---- Single shared login (no per-user accounts) ----
  // Username/password are NOT in code: set them as Vercel environment
  // variables VMS_USERNAME and VMS_PASSWORD (Production + Preview),
  // then redeploy. Changing them = changing the env vars, no code change.
  // A successful login gets a signed, httpOnly SESSION cookie (no Max-Age):
  // the browser deletes it when the browser is fully closed, so reopening
  // the app asks for username/password again, like the other app. The
  // signed payload still carries a 12-hour expiry as a backstop.
  function sessionSecret() { return process.env.VMS_SESSION_SECRET || process.env.VMS_PASSWORD || ''; }
  function safeEqual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
  function signSession(username) {
    const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 12 * 3600 * 1000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
    return `${payload}.${sig}`;
  }
  function verifySession(req) {
    try {
      const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('vms_session='));
      if (!cookie) return false;
      const [payload, sig] = cookie.slice('vms_session='.length).split('.');
      if (!payload || !sig || !safeEqual(crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex'), sig)) return false;
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.exp > Date.now();
    } catch { return false; }
  }
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) return next();
    if (['/api/login', '/api/logout', '/api/health'].includes(req.path)) return next();
    if (verifySession(req)) return next();
    return res.status(401).json({ error: 'Please log in first.' });
  });
  app.post('/api/login', (req, res) => {
    const envUser = process.env.VMS_USERNAME, envPass = process.env.VMS_PASSWORD;
    if (!envUser || !envPass) return res.status(503).json({ error: 'Login is not set up yet. Set VMS_USERNAME and VMS_PASSWORD in Vercel environment variables, then redeploy.' });
    const { username, password } = req.body || {};
    if (!username || !password || !safeEqual(username, envUser) || !safeEqual(password, envPass)) return res.status(401).json({ error: 'Username ya password ghalat hai.' });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `vms_session=${signSession(username)}; HttpOnly; Path=/; SameSite=Lax${secure}`);
    res.json({ ok: true });
  });
  app.post('/api/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'vms_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    res.json({ ok: true });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  function normaliseReason(body) {
    if (body.reason === 'OTHER') {
      if (!body.other_reason || !body.other_reason.trim()) return { error: 'Please type the reason when Other is selected.' };
      return { reason: body.other_reason.trim() };
    }
    return { reason: (body.reason || '').trim() || null };
  }
  async function uploadPhoto(file) {
    if (!file) return null;
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const name = `photos/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(name, file.buffer, { contentType: file.mimetype || 'image/jpeg', upsert: false });
    if (error) throw new Error('Photo upload failed: ' + error.message);
    return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, today_pkt: pktDate(), supabase_configured: Boolean(supabase) }));

  // Visitor Form: still-inside AND visit_date = today (Pakistan).
  app.get('/api/visitors/inside-today', async (_req, res) => {
    const { data, error } = await supabase.from('visitors').select('*').is('time_out', null).eq('visit_date', pktDate()).order('time_in', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // Summary: ALL, with optional From/To date-between filter (by visit_date) + search.
  app.get('/api/visitors/all', async (req, res) => {
    const { from, to, q } = req.query;
    let query = supabase.from('visitors').select('*');
    if (from) query = query.gte('visit_date', from);
    if (to) query = query.lte('visit_date', to);
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      query = query.or(`person_name.ilike.${like},emp_code_cnic.ilike.${like},visitor_card_no.ilike.${like},coming_from.ilike.${like},visitor_category.ilike.${like},mobile_no.ilike.${like},reason.ilike.${like},person_to_contact.ilike.${like},department.ilike.${like}`);
    }
    const { data, error } = await query.order('visit_date', { ascending: false }).order('time_in', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get('/api/visitors/lookup', async (req, res) => {
    const code = (req.query.code || '').trim();
    if (!code) return res.json(null);
    const { data, error } = await supabase.from('visitors').select('*').eq('emp_code_cnic', code).order('id', { ascending: false }).limit(1).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || null);
  });

  app.get('/api/suggestions', async (_req, res) => {
    const { data, error } = await supabase.from('visitors').select('person_to_contact,department');
    if (error) return res.status(500).json({ error: error.message });
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    res.json({ persons: uniq(data.map(r => r.person_to_contact)), departments: uniq(data.map(r => r.department)) });
  });

  app.get('/api/dashboard', async (_req, res) => {
    const today = pktDate();
    const countWhere = async (fn) => {
      const { count, error } = await fn(supabase.from('visitors').select('*', { count: 'exact', head: true }));
      if (error) throw new Error(error.message);
      return count || 0;
    };
    try {
      // All five reads run in parallel (one round-trip each, not sequential).
      const [total, out, todayIn, todayOut, groupRes] = await Promise.all([
        countWhere(q => q),
        countWhere(q => q.not('time_out', 'is', null)),
        countWhere(q => q.eq('visit_date', today)),
        countWhere(q => q.eq('visit_date', today).not('time_out', 'is', null)),
        supabase.from('visitors').select('department,visitor_category,time_in,time_out,person_to_contact'),
      ]);
      const data = groupRes.data;
      // Peak hour: group Time In by Pakistan hour (UTC+5). Only hours with visits.
      const hourMap = new Map();
      const durations = [];
      (data || []).forEach(r => {
        const inD = r.time_in ? new Date(r.time_in) : null;
        if (inD && !isNaN(inD)) {
          const h = (inD.getUTCHours() + 5) % 24;
          hourMap.set(h, (hourMap.get(h) || 0) + 1);
        }
        // Average duration: completed visits only (Time Out set, sane range).
        if (r.time_in && r.time_out) {
          const mins = (new Date(r.time_out) - new Date(inD)) / 60000;
          if (mins > 0 && mins <= 720) durations.push(mins);
        }
      });
      const by_hour = [...hourMap.entries()].sort((a, b) => a[0] - b[0])
        .map(([h, n]) => ({ name: `${String(h).padStart(2, '0')}:00`, n }));
      const peakEntry = [...hourMap.entries()].sort((a, b) => b[1] - a[1])[0];
      const fmtHour12 = (h) => { const ap = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh} ${ap}`; };
      const peak_hour = peakEntry ? { hour: peakEntry[0], label: `${fmtHour12(peakEntry[0])} – ${fmtHour12((peakEntry[0] + 1) % 24)}`, n: peakEntry[1] } : null;
      const avg_duration_min = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
      const group = (key) => {
        const m = new Map();
        (data || []).forEach(r => { const k = r[key] || '(blank)'; m.set(k, (m.get(k) || 0) + 1); });
        return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
      };
      res.json({ total_check_in: total, total_check_out: out, balance: total - out, today_check_in: todayIn, today_check_out: todayOut, by_department: group('department'), by_category: group('visitor_category'), by_contact: group('person_to_contact').slice(0, 10), by_hour, peak_hour, avg_duration_min, completed_visits: durations.length, today_pkt: today });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/visitors/:id', async (req, res) => {
    const { data, error } = await supabase.from('visitors').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  });

  app.post('/api/visitors', upload.single('photo'), async (req, res) => {
    const b = req.body;
    if (!CATEGORIES.includes(b.visitor_category)) return res.status(400).json({ error: 'Please select a valid Visitor Category.' });
    if (!b.person_name || !b.person_name.trim()) return res.status(400).json({ error: 'Person Name is required.' });
    const { reason, error } = normaliseReason(b);
    if (error) return res.status(400).json({ error });
    try {
      const photoPath = req.file ? await uploadPhoto(req.file) : (b.previous_photo_path || null);
      const { data, error: dbErr } = await supabase.from('visitors').insert({
        visit_date: b.visit_date || pktDate(), visitor_category: b.visitor_category,
        visitor_card_no: b.visitor_card_no || null, emp_code_cnic: b.emp_code_cnic || null,
        person_name: b.person_name.trim(), mobile_no: b.mobile_no || null, coming_from: b.coming_from || null,
        reason, person_to_contact: b.person_to_contact || null, department: b.department || null,
        time_in: b.time_in || nowIso(), time_out: null, photo_path: photoPath, created_on: nowIso(),
      }).select().single();
      if (dbErr) return res.status(500).json({ error: dbErr.message });
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/visitors/:id', upload.single('photo'), async (req, res) => {
    const { data: old, error: getErr } = await supabase.from('visitors').select('*').eq('id', req.params.id).maybeSingle();
    if (getErr) return res.status(500).json({ error: getErr.message });
    if (!old) return res.status(404).json({ error: 'Not found' });
    const b = req.body;
    if (!CATEGORIES.includes(b.visitor_category)) return res.status(400).json({ error: 'Please select a valid Visitor Category.' });
    if (!b.person_name || !b.person_name.trim()) return res.status(400).json({ error: 'Person Name is required.' });
    const { reason, error } = normaliseReason(b);
    if (error) return res.status(400).json({ error });
    try {
      // Edit: Time In / Time Out preserved, auto-fill NOT applied in edit mode.
      const photoPath = req.file ? await uploadPhoto(req.file) : old.photo_path;
      const { data, error: dbErr } = await supabase.from('visitors').update({
        visit_date: b.visit_date || old.visit_date, visitor_category: b.visitor_category,
        visitor_card_no: b.visitor_card_no || null, emp_code_cnic: b.emp_code_cnic || null,
        person_name: b.person_name.trim(), mobile_no: b.mobile_no || null, coming_from: b.coming_from || null,
        reason, person_to_contact: b.person_to_contact || null, department: b.department || null, photo_path: photoPath,
      }).eq('id', req.params.id).select().single();
      if (dbErr) return res.status(500).json({ error: dbErr.message });
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/visitors/:id/outstamp', async (req, res) => {
    const { data: old, error: getErr } = await supabase.from('visitors').select('*').eq('id', req.params.id).maybeSingle();
    if (getErr) return res.status(500).json({ error: getErr.message });
    if (!old) return res.status(404).json({ error: 'Not found' });
    if (old.time_out) return res.json(old);
    const { data, error } = await supabase.from('visitors').update({ time_out: nowIso() }).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  // One click stamps out EVERY visitor currently inside (time_out still
  // empty), all with the same current time. Already-stamped-out rows are
  // untouched, so pressing it twice changes nothing the second time.
  app.post('/api/visitors/outstamp-all', async (req, res) => {
    const { data, error } = await supabase.from('visitors').update({ time_out: nowIso() }).is('time_out', null).select('id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ stamped_out: (data || []).length });
  });

  app.delete('/api/visitors/:id', async (req, res) => {
    const { data: row } = await supabase.from('visitors').select('photo_path').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('visitors').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    // Free the storage space too: a deleted row's photo file must not linger
    // in the bucket, or deleting rows would never shrink usage.
    if (row && row.photo_path) {
      const marker = `/visitor-photos/`;
      const idx = row.photo_path.indexOf(marker);
      if (idx >= 0) {
        const filePath = decodeURIComponent(row.photo_path.slice(idx + marker.length));
        await supabase.storage.from(BUCKET).remove([filePath]);
      }
    }
    res.json({ ok: true });
  });

  return app;
}

module.exports = { createApp, pktDate };
