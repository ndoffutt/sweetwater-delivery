-- ============================================================================
-- SWEETWATER STAGING BOOTSTRAP — paste into the STAGING Supabase SQL Editor.
-- Self-resetting + schema-only. Data is loaded separately by seed-staging.mjs.
-- Assembled by staging/build-bootstrap.mjs.
-- ============================================================================
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

-- Storage lives in the 'storage' schema (not reset above) — clear any
-- conflicting policies a prior run created, then ensure both buckets exist.
do $$ begin
  for r in (select policyname from pg_policies where schemaname='storage' and tablename='objects')
  loop execute format('drop policy if exists %I on storage.objects', r.policyname); end loop;
end $$;
insert into storage.buckets (id, name, public) values ('stop-photos', 'stop-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('manifests',   'manifests',   false) on conflict (id) do nothing;


-- ===== supabase/dev_bootstrap.sql =====
-- ============================================================
-- DEV BOOTSTRAP - full schema for a fresh dev Supabase project.
-- Paste this entire file into the DEV project's SQL editor and Run.
-- Do NOT run against production.
-- ============================================================

-- ── From migration.sql ──
-- Sweetwater's Delivery App — Initial Schema
-- Run this in the Supabase SQL Editor

create extension if not exists pgcrypto;

-- Clean teardown so this migration is safely re-runnable
drop table if exists customer_signups cascade;
drop table if exists text_messages cascade;
drop table if exists driver_locations cascade;
drop table if exists stop_photos cascade;
drop table if exists route_stops cascade;
drop table if exists routes cascade;
drop table if exists customers cascade;
drop table if exists users cascade;

-- ============================================================
-- USERS (drivers + dispatchers, PIN-based auth)
-- ============================================================
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('driver', 'dispatcher')),
  pin_hash text not null,
  phone text,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  phone text,
  lat double precision,
  lng double precision,
  gate_code text,
  delivery_notes text,
  tags text[] not null default '{}',
  spot_account text,
  account_type text,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMER SIGNUPS (pending website delivery requests)
-- ============================================================
create table customer_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  address text not null,
  phone text,
  email text,
  start_date text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now()
);

create index customer_signups_status_idx
  on customer_signups(status, created_at desc);

-- ============================================================
-- ROUTES (one per day, typically)
-- ============================================================
create table routes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  driver_id uuid not null references users(id),
  status text not null default 'draft' check (status in ('draft', 'dispatched', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index routes_date_idx on routes(date) where deleted_at is null;

-- ============================================================
-- ROUTE STOPS
-- ============================================================
create table route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  customer_id uuid not null references customers(id),
  stop_order integer not null,
  status text not null default 'pending' check (status in ('pending', 'arrived', 'completed', 'skipped')),
  has_dropoff boolean not null default false,
  has_pickup boolean not null default false,
  dropoff_confirmed boolean not null default false,
  pickup_confirmed boolean not null default false,
  notes text,
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- STOP PHOTOS (proof of delivery)
-- ============================================================
create table stop_photos (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references route_stops(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- DRIVER LOCATIONS (GPS pings)
-- ============================================================
create table driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references users(id),
  route_id uuid references routes(id),
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  created_at timestamptz not null default now()
);

create index driver_locations_driver_time on driver_locations(driver_id, created_at desc);

-- ============================================================
-- TEXT MESSAGES (SMS log)
-- ============================================================
create table text_messages (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid references route_stops(id),
  customer_phone text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at before update on users for each row execute function set_updated_at();
create trigger customers_updated_at before update on customers for each row execute function set_updated_at();
create trigger routes_updated_at before update on routes for each row execute function set_updated_at();
create trigger route_stops_updated_at before update on route_stops for each row execute function set_updated_at();

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public) values ('stop-photos', 'stop-photos', true)
on conflict do nothing;

-- ============================================================
-- SEED DATA
-- ============================================================
-- Manager PIN: 0000 (dispatcher). Driver has no PIN — tap "Start Driving" to sign in.

-- Sample customers

-- ── From manager_console.sql ──
-- Manager console additions to the customers table. Run in the Supabase SQL Editor.
-- tags     -> VIP / Seasonal / Commercial filters + VIP star
-- spot_account / account_type -> SPOT account ref + Delivery/A-R badge

alter table customers add column if not exists tags text[] not null default '{}';
alter table customers add column if not exists spot_account text;
alter table customers add column if not exists account_type text;

-- ── From route_seq.sql ──
-- Master route order: position each customer by your hand-built delivery_route.csv.
-- Stored as a decimal so new customers can be slotted between two neighbors
-- (e.g. 6.5 between 6 and 7) without renumbering the whole route.
alter table customers add column if not exists route_seq double precision;
alter table customers alter column route_seq type double precision;

-- ── From signups.sql ──
-- Pending website delivery signups. Run this in the Supabase SQL Editor.
-- New signups from the website land here; the manager reviews and converts
-- them into customers from the dispatch app.

create table if not exists customer_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  address text not null,
  phone text,
  email text,
  start_date text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now()
);

create index if not exists customer_signups_status_idx
  on customer_signups(status, created_at desc);

-- ── From manifest_scans.sql ──
-- Dispatch console: store each scanned SPOT manifest so the empty state can show
-- the "last scanned manifest" preview (sheet thumbnail + what Claude pulled).
-- Run in the Supabase SQL Editor. (The private `manifests` storage bucket is
-- created separately via the storage API.)

create table if not exists manifest_scans (
  id uuid primary key default gen_random_uuid(),
  image_path text,                 -- path in the `manifests` storage bucket (null for CSV)
  source text not null default 'photo',  -- 'photo' | 'pdf' | 'csv'
  stops jsonb not null default '[]',     -- the extracted stops, as returned to the UI
  stop_count integer not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists manifest_scans_created_at on manifest_scans(created_at desc);

-- ── From messaging.sql ──
-- Messaging: two-way SMS through the office number (Twilio Hosted SMS).
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- One row per SMS, inbound or outbound. Threads are grouped by phone number
-- in the app (matched to customers by their last 10 digits), so texts from a
-- customer and replies from any device all live in one conversation.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  phone text not null,                                   -- customer's number as sent/received
  body text not null,
  customer_id uuid references customers(id) on delete set null,
  stop_id uuid references route_stops(id) on delete set null,
  sender_name text,                                      -- who sent an outbound msg (Manager / Driver / auto)
  status text not null default 'pending',                -- pending | sent | delivered | failed | received
  twilio_sid text,
  error text,
  read_at timestamptz,                                   -- inbound: when a staff member opened the thread
  created_at timestamptz not null default now()
);

create index if not exists messages_phone_idx on messages (phone, created_at desc);
create index if not exists messages_unread_idx on messages (read_at) where direction = 'inbound' and read_at is null;
create index if not exists messages_sid_idx on messages (twilio_sid);

-- ── From prospects.sql ──
-- B2B Prospects — lightweight outreach tracker (replaces HubSpot)
-- Run this in the Supabase SQL Editor (safe to re-run; drops + recreates).
--
-- Seed imported from HubSpot 2026-06-11 using the DEALS pipeline as the source
-- of truth. Stage mapping: Opportunity/Pilot→working, Closed Won→active,
-- Off For Now→on_hold, Out of Scope→dead. Deals in the DELETE stage and
-- household/individual leads are excluded (B2B only). Notes + call logs are
-- preserved as touchpoints with their original dates.

drop table if exists prospect_touchpoints cascade;
drop table if exists prospects cascade;

create table prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,        -- main point of contact
  contact_title text,
  phone text,
  email text,
  address text,              -- at least "Town, NY" so the map can place it
  website text,
  lat double precision,
  lng double precision,
  -- "Commercial" is the umbrella; these are the segments within it.
  business_type text not null default 'other'
    check (business_type in ('hotel', 'club', 'restaurant', 'retail', 'prop_manager', 'other')),
  -- new: spotted, never contacted · working: in conversation, pursuing
  -- active: customer now · on_hold: revisit later · dead: never winnable
  status text not null default 'new'
    check (status in ('new', 'working', 'active', 'on_hold', 'dead')),
  -- what an active account buys: employees / linen / referral
  services text[] not null default '{}',
  notes text,                -- persistent notes, kept for life of the relationship
  customer_id uuid references customers(id),
  hubspot_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prospect_touchpoints (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'text', 'visit', 'delivery', 'note')),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index prospect_touchpoints_prospect_idx
  on prospect_touchpoints(prospect_id, created_at desc);

create trigger prospects_updated_at
  before update on prospects for each row execute function set_updated_at();

-- ============================================================
-- SEED — businesses
-- ============================================================

-- ============================================================
-- SEED — touchpoint history (from HubSpot notes + call logs)
-- ============================================================

-- ============================================================
-- SEED — services each active account buys
-- ============================================================

-- ── From admin_role.sql ──
-- Roles v2: adds the 'admin' role alongside driver/dispatcher (manager).
-- The PIN you type at Staff Login decides which account you are:
--   Manager PIN 0000 (role: dispatcher) - drive, dispatch, sales
--   Admin   PIN 8888 (role: admin)      - drive, dispatch, sales (+ future admin-only)
-- CHANGE THE ADMIN PIN before running in production: edit '8888' below.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('driver', 'dispatcher', 'admin'));


-- ── From delivery_day.sql ──
-- Delivery-day designation: Wednesday = East Hampton town (east of the shop,
-- route stops 1-25), Thursday = everything west of the shop (stops 26+).
-- The manifest review screen flags stops that land on the wrong day's run.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table customers add column if not exists delivery_day text
  check (delivery_day in ('wednesday', 'thursday'));

-- Backfill from the current master route order: 1-25 east -> Wednesday,
-- 26+ west -> Thursday. Customers without a route position stay unassigned
-- (set them in the directory, or they auto-assign by location when added
-- from a manifest).

-- ── From delivery_days.sql ──
-- Multi-day delivery: a customer can be on more than one run day. Monday is a
-- small commercial-only run; Wednesday = east of the shop, Thursday = west.
alter table customers add column if not exists delivery_days text[] not null default '{}';

alter table customers drop constraint if exists customers_delivery_days_valid;
alter table customers add constraint customers_delivery_days_valid
  check (delivery_days <@ array['monday', 'wednesday', 'thursday']::text[]);




-- ===== supabase/push_subscriptions.sql =====
-- Web Push subscriptions for visit reminders. One row per device/browser that
-- opted in. Run in the Supabase SQL editor. Safe to run more than once.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  endpoint text not null unique,   -- the push service URL for this device
  p256dh text not null,            -- client public key (payload encryption)
  auth text not null,              -- client auth secret
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);


-- ===== supabase/prospects.sql =====
-- B2B Prospects — lightweight outreach tracker (replaces HubSpot)
-- Run this in the Supabase SQL Editor (safe to re-run; drops + recreates).
--
-- Seed imported from HubSpot 2026-06-11 using the DEALS pipeline as the source
-- of truth. Stage mapping: Opportunity/Pilot→working, Closed Won→active,
-- Off For Now→on_hold, Out of Scope→dead. Deals in the DELETE stage and
-- household/individual leads are excluded (B2B only). Notes + call logs are
-- preserved as touchpoints with their original dates.

drop table if exists prospect_touchpoints cascade;
drop table if exists prospects cascade;

create table prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,        -- main point of contact
  contact_title text,
  phone text,
  email text,
  address text,              -- at least "Town, NY" so the map can place it
  town text,                 -- East End hamlet/village, shown as a tag
  website text,
  lat double precision,
  lng double precision,
  -- "Commercial" is the umbrella; these are the segments within it.
  business_type text not null default 'other'
    check (business_type in ('hotel', 'club', 'restaurant', 'retail', 'prop_manager', 'other')),
  -- new: spotted, never contacted · working: in conversation, pursuing
  -- active: customer now · on_hold: revisit later · dead: never winnable
  status text not null default 'new'
    check (status in ('new', 'working', 'active', 'on_hold', 'dead')),
  -- what an active account buys: employees / linen / referral
  services text[] not null default '{}',
  -- sales priority: low / medium / high
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text,                -- persistent notes, kept for life of the relationship
  customer_id uuid references customers(id),
  hubspot_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prospect_touchpoints (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'text', 'visit', 'delivery', 'note')),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create index prospect_touchpoints_prospect_idx
  on prospect_touchpoints(prospect_id, created_at desc);

create trigger prospects_updated_at
  before update on prospects for each row execute function set_updated_at();

-- ============================================================
-- SEED — businesses
-- ============================================================

-- ============================================================
-- SEED — touchpoint history (from HubSpot notes + call logs)
-- ============================================================

-- ============================================================
-- SEED — services each active account buys
-- ============================================================

-- ============================================================
-- LINK — prospects that are already delivery customers
-- (never double-add: match by normalized name)
-- ============================================================

-- ============================================================
-- TOWN — tag each prospect with its hamlet/village (from the address)
-- ============================================================


-- ===== supabase/prospect_priority.sql =====
-- Sales priority for prospects: low / medium / high. Drives sorting and a
-- colored tag in the directory. Run in the Supabase SQL editor. Safe to re-run.

alter table prospects add column if not exists priority text not null default 'medium';

alter table prospects drop constraint if exists prospects_priority_check;
alter table prospects add constraint prospects_priority_check
  check (priority in ('low', 'medium', 'high'));


-- ===== supabase/prospect_town.sql =====
-- Town tag for prospects: the East End hamlet/village (Bridgehampton, Sag
-- Harbor, East Hampton, …), shown as a chip and derived from the address.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table prospects add column if not exists town text;

-- Pre-tag everything we already know: pull the segment right before ", NY"
-- out of the address ("23 Short Beach Rd, Sag Harbor, NY 11963" -> "Sag
-- Harbor"; "Cutchogue, NY 11935" -> "Cutchogue").


-- ===== supabase/route_prospect_visits.sql =====
-- Prospect visits attached to a delivery route: while building a route, the
-- manager adds overdue prospects that sit near the day's stops, then logs the
-- visit (with notes) when he gets there. Run in the Supabase SQL editor.
create table if not exists route_prospect_visits (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned', 'visited', 'skipped')),
  notes text,
  visited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (route_id, prospect_id)
);

create index if not exists route_prospect_visits_route_idx on route_prospect_visits(route_id);


-- ===== supabase/delivery_day.sql =====
-- Delivery-day designation: Wednesday = East Hampton town (east of the shop,
-- route stops 1-25), Thursday = everything west of the shop (stops 26+).
-- The manifest review screen flags stops that land on the wrong day's run.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table customers add column if not exists delivery_day text
  check (delivery_day in ('wednesday', 'thursday'));

-- Backfill from the current master route order: 1-25 east -> Wednesday,
-- 26+ west -> Thursday. Customers without a route position stay unassigned
-- (set them in the directory, or they auto-assign by location when added
-- from a manifest).


-- ===== supabase/delivery_days.sql =====
-- Multi-day delivery: a customer can be on more than one run day (e.g. a
-- commercial account delivered Monday AND Thursday). Supersedes the single
-- delivery_day column. Monday is a small commercial-only run; Wednesday = east
-- of the shop, Thursday = west.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table customers add column if not exists delivery_days text[] not null default '{}';

-- Every element must be a known run day.
alter table customers drop constraint if exists customers_delivery_days_valid;
alter table customers add constraint customers_delivery_days_valid
  check (delivery_days <@ array['monday', 'wednesday', 'thursday']::text[]);

-- Backfill from the old single-day column (idempotent: only fills empties).

-- Standing twice-weekly commercial accounts: Brunello Cucinelli + Hedges Inn
-- deliver Monday and Thursday. No-op if those customers aren't in the directory.


-- ===== supabase/messaging.sql =====
-- Messaging: two-way SMS through the office number (Twilio Hosted SMS).
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- One row per SMS, inbound or outbound. Threads are grouped by phone number
-- in the app (matched to customers by their last 10 digits), so texts from a
-- customer and replies from any device all live in one conversation.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  phone text not null,                                   -- customer's number as sent/received
  body text not null,
  customer_id uuid references customers(id) on delete set null,
  stop_id uuid references route_stops(id) on delete set null,
  sender_name text,                                      -- who sent an outbound msg (Manager / Driver / auto)
  status text not null default 'pending',                -- pending | sent | delivered | failed | received
  twilio_sid text,
  error text,
  read_at timestamptz,                                   -- inbound: when a staff member opened the thread
  created_at timestamptz not null default now()
);

create index if not exists messages_phone_idx on messages (phone, created_at desc);
create index if not exists messages_unread_idx on messages (read_at) where direction = 'inbound' and read_at is null;
create index if not exists messages_sid_idx on messages (twilio_sid);


-- ===== supabase/signups.sql =====
-- Pending website delivery signups. Run this in the Supabase SQL Editor.
-- New signups from the website land here; the manager reviews and converts
-- them into customers from the dispatch app.

create table if not exists customer_signups (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  address text not null,
  phone text,
  email text,
  start_date text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'added', 'dismissed')),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now()
);

create index if not exists customer_signups_status_idx
  on customer_signups(status, created_at desc);

