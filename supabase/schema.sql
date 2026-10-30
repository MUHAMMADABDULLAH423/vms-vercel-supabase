-- ============================================================
-- Visitor Management System — Supabase (Postgres) schema
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New query.
-- It creates the visitors table + the photo Storage bucket.
-- Demo data only: the seed at the bottom inserts 5 fake visitors
-- (DEMO-001..DEMO-005). No real names, CNIC numbers or photos.
-- ============================================================

create table if not exists public.visitors (
  id bigint generated always as identity primary key,
  visit_date date not null,
  visitor_category text not null,
  visitor_card_no text,
  emp_code_cnic text,
  person_name text not null,
  mobile_no text,
  coming_from text,
  reason text,
  person_to_contact text,
  department text,
  time_in timestamptz not null,
  time_out timestamptz,
  photo_path text,
  created_on timestamptz not null default now()
);

create index if not exists visitors_visit_date_idx on public.visitors (visit_date);
create index if not exists visitors_code_idx on public.visitors (emp_code_cnic);
create index if not exists visitors_inside_idx on public.visitors (time_out) where time_out is null;

-- The app talks to Supabase ONLY through its own serverless API
-- (api/index.js) using the SERVICE ROLE key, which bypasses RLS.
-- The browser never talks to Supabase directly and never needs the
-- anon key, so enabling RLS with no public policies is the safe default.
alter table public.visitors enable row level security;

-- ---------- Photo Storage bucket (public read, so <img> tags work) ----------
insert into storage.buckets (id, name, public)
values ('visitor-photos', 'visitor-photos', true)
on conflict (id) do nothing;

-- Allow anyone to VIEW photos (they are shown in the app's tables).
create policy "Public read visitor photos"
  on storage.objects for select
  using (bucket_id = 'visitor-photos');
-- Uploads/deletes go through the service-role API only, so no public
-- insert/update/delete policy is created on purpose.

-- ============================================================
-- DEMO SEED (optional — delete it if you want to start empty).
-- Dates are relative to "today" in Pakistan time, so the Visitor
-- Form (today-only) always has demo rows on first run.
-- ============================================================
insert into public.visitors
  (visit_date, visitor_category, visitor_card_no, emp_code_cnic, person_name, mobile_no, coming_from, reason, person_to_contact, department, time_in, time_out)
values
  ((current_timestamp at time zone 'Asia/Karachi')::date, 'GENERAL VISITOR', 'V-101', 'DEMO-001', 'Demo Visitor One', '0300-1111111', 'Demo Company', 'Meeting Visitor (General)', 'Demo Manager', 'Administration',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '09:15') at time zone 'Asia/Karachi', null),
  ((current_timestamp at time zone 'Asia/Karachi')::date, 'VENDOR / SUPPLIER', 'V-102', 'DEMO-002', 'Demo Visitor Two', '0300-2222222', 'Demo Supplies', 'Goods Delivery', 'Demo Store Incharge', 'Stores',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '10:05') at time zone 'Asia/Karachi', null),
  ((current_timestamp at time zone 'Asia/Karachi')::date, 'CONTRACTOR / SERVICE', 'V-103', 'DEMO-003', 'Demo Visitor Three', '0300-3333333', 'Demo Services', 'Maintenance or Service', 'Demo Engineer', 'Engineering',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '08:40') at time zone 'Asia/Karachi',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '11:20') at time zone 'Asia/Karachi'),
  (((current_timestamp at time zone 'Asia/Karachi')::date) - 1, 'DELIVERY', 'V-104', 'DEMO-004', 'Demo Visitor Four', '0300-4444444', 'Demo Couriers', 'Lunch Delivery (at Reception)', 'Demo Reception', 'Administration',
   (((current_timestamp at time zone 'Asia/Karachi')::date) - 1 + time '12:30') at time zone 'Asia/Karachi',
   (((current_timestamp at time zone 'Asia/Karachi')::date) - 1 + time '12:55') at time zone 'Asia/Karachi'),
  ((current_timestamp at time zone 'Asia/Karachi')::date, 'EMPLOYEE / INTER-UNIT', 'V-105', 'DEMO-005', 'Demo Visitor Five', '0300-5555555', 'Demo Unit', 'Employee Guest', 'Demo HR Officer', 'Human Resources',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '09:50') at time zone 'Asia/Karachi',
   ((current_timestamp at time zone 'Asia/Karachi')::date + time '13:10') at time zone 'Asia/Karachi');
