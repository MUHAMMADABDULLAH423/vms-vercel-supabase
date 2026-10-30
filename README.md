# Visitor Management System — Vercel + Supabase

Same VMS as the Oracle APEX version (Home, Visitor Form, Summary, Dashboard, Create
Visitor, photo, OutStamp, returning-visitor auto-fill), plus the 3 later changes:

1. **Person To Be Contacted / Department are manually writable** — type freely, with
   suggestions from values already saved. A new value saves exactly and then appears
   as a suggestion.
2. **Summary date filter** — small From Date / To Date calendars on top, with Apply
   and Clear. Both dates = between them inclusive by visit date. From-only / To-only
   work. Both blank = ALL (the default).
3. **Visitor Form shows only today** — still-inside visitors for the current Pakistan
   day only. Summary shows ALL. Older still-inside entries stay in Summary; they are
   NOT deleted or stamped out.

Other rules kept from APEX: Reason is a dropdown (10 reasons + Other; Other saves the
typed text, empty Other is blocked), Edit exists ONLY in Visitor Form (not Summary),
auto-fill is disabled in edit mode, Time In / Time Out are shown as Pakistan time only,
and Time In is set automatically (hidden on the create form).

## Why Supabase here (and not a SQLite file)

Vercel is serverless: its filesystem is temporary, so a SQLite file there would lose
data on redeploy / new instances. So on Vercel the data lives in Supabase instead:

- **Database:** Supabase Postgres table `public.visitors`
- **Photos:** Supabase Storage bucket `visitor-photos` (public read, so the app's
  `<img>` tags work)
- **Security:** the browser NEVER talks to Supabase directly. Only the serverless
  API (`api/index.js`) uses the SERVICE ROLE key, and the table has RLS enabled
  with no public policies. Never put the service-role key in frontend code, and
  never send it in chat.

Demo data only: the seed in `supabase/schema.sql` inserts 5 fake visitors
(DEMO-001..DEMO-005). No real names, CNIC numbers or photos are included.

## Setup — Step 1: Create a NEW Supabase project (do not reuse another app's project)

1. Go to https://supabase.com/dashboard and sign in (the same way you signed in
   for your other projects).
2. **New project** — give it a name like `vms`, pick a region near you
   (Singapore works well from Pakistan), set a database password, Create.
3. Left menu → **SQL Editor → New query** → paste the whole contents of
   `supabase/schema.sql` → **Run**. This creates the table, indexes, RLS, the
   `visitor-photos` bucket, and the 5 demo visitors.
4. Left menu → **Settings → API** → copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role key** (under "Project API keys", the secret one — NOT the
     anon key) → this is `SUPABASE_SERVICE_ROLE_KEY`
   - Keep the service-role key secret. It is only ever pasted into `.env`
     (local) or Vercel Environment Variables — never into chat, code, or GitHub.

## Setup — Step 2: Deploy on Vercel

Option A — from GitHub (recommended):
1. Push this folder to a new GitHub repository.
2. Vercel Dashboard → Add New → Project → Import that repository.
3. Vercel will use `vercel.json` (builds the React app, serves `client/dist`,
   rewrites `/api/*` to the serverless function).
4. **Settings → Environment Variables** → add for Production (and Preview):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your service-role key
5. Deploy. Open the Vercel URL — Home should show the demo KPIs
   (5 total / 3 out / 2 inside on first run).

Option B — Vercel CLI:
```bash
npm i -g vercel
vercel login
vercel --prod
# when asked, add the two env vars above in the Vercel dashboard afterwards
# and redeploy: vercel --prod
```

## Run locally (optional, same Supabase project)

```bash
cp .env.example .env   # then fill SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
npm install
npm --prefix client install
npm run build
npm start
# open http://localhost:3000
```

For frontend-only development: run the backend (`npm start`) in one terminal and
`npm --prefix client run dev` in another, then open http://localhost:5173
(API calls are proxied to port 3000).

## API (serverless, same as the local version)

- `GET /api/visitors/inside-today`, `GET /api/visitors/all?from=&to=&q=`
- `GET /api/visitors/lookup?code=`, `GET /api/suggestions`, `GET /api/dashboard`
- `POST /api/visitors` (multipart, `photo` file), `PUT /api/visitors/:id`
- `POST /api/visitors/:id/outstamp`, `DELETE /api/visitors/:id`

## Notes / limits

- Supabase free tier pauses a project after ~7 days of no activity; if the app
  suddenly shows no data, open the Supabase dashboard and Restore the project
  (free, takes minutes) — this is the same pause behaviour as your other
  Supabase projects, not a code problem.
- Photos are stored in Supabase Storage, not in the database, so the table
  stays small even with many visitors.
- If you later want the local hard-disk version again, it is a separate build
  (React + SQLite file) — the two do not share data.
