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
  -- How the route was built: scanned from a SPOT manifest, or built by hand in
  -- the dispatch console. Null on routes created before this column existed.
  source text check (source in ('manifest', 'manual')),
  started_at timestamptz,
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Incremental migration for a live DB that predates the `source` column above:
--   alter table routes add column if not exists source text
--     check (source in ('manifest', 'manual'));

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
insert into users (name, role, pin_hash, phone) values
  ('Manager', 'dispatcher', encode(digest('0000' || 'sw-delivery-2026', 'sha256'), 'hex'), null),
  ('Driver', 'driver', 'no-pin', null);

-- Sample customers
insert into customers (name, address, phone, gate_code, delivery_notes) values
  ('Johnson Residence', '142 Ocean Ave, Wainscott, NY 11975', '631-555-0101', '4521', 'Leave on side porch, ring doorbell'),
  ('Smith Estate', '28 Dune Rd, Hampton Bays, NY 11946', '631-555-0102', null, 'Main entrance, hand to housekeeper'),
  ('Williams House', '55 Beach Ln, Wainscott, NY 11975', '631-555-0103', '0000#', 'Back gate — use intercom. Dog friendly.'),
  ('Chen Family', '310 Montauk Hwy, Hampton Bays, NY 11946', '631-555-0104', null, null),
  ('Davis Cottage', '7 Sagg Main St, Sagaponack, NY 11962', '631-555-0105', '8833', 'Fragile items — place in mudroom, never on steps'),
  ('Peterson Home', '92 Flying Point Rd, Water Mill, NY 11976', '631-555-0106', null, 'Use service entrance around back');
-- Separate drop-off vs pick-up photo proof + first-class "nothing to pick up".
--
-- Why: on 2026-07-09 two stops were completed with the pickup silently missed
-- (one photo satisfied the whole stop), two stops were skipped AFTER a pickup
-- was confirmed, and one stop was skipped as "Other: No pick up" because the
-- driver had no way to say "nothing was out".
--
-- stop_photos.kind — which service the photo proves. Null = legacy photo
-- (taken before this migration); the app treats those as wildcard proof.
alter table stop_photos
  add column if not exists kind text check (kind in ('dropoff', 'pickup'));

-- route_stops.pickup_none — the driver went, but the customer had nothing out.
-- Completes the pickup obligation without a photo and without a skip.
alter table route_stops
  add column if not exists pickup_none boolean not null default false;
-- Out-of-range customers: too far to service right now, shelved from the
-- delivery list without deleting them. They stay in the directory (findable
-- under the "Out of range" filter) and can be brought back any time.
--
-- Distinct from `active`/`deleted_at` (soft-delete). Out-of-range keeps the
-- customer active; it only hides them from route building + the master route.
alter table customers
  add column if not exists out_of_range boolean not null default false;
-- Structured address (street / town / zip) + email on customers.
--
-- The single `address` column stays canonical — geocoding, maps, and every
-- existing read still use it. These new columns are the editable *parts*, and
-- the app composes them back into `address` on save. Email is captured for
-- every customer going forward.
alter table customers add column if not exists street text;
alter table customers add column if not exists town   text;
alter table customers add column if not exists zip    text;
alter table customers add column if not exists email  text;

-- Backfill the parts from existing one-line addresses, best-effort. Handles the
-- common "…street…, Town, NY 11963" shape (with or without a place-name prefix).
update customers set
  zip = coalesce(zip, (regexp_match(address, '(\d{5})(?:-\d{4})?\s*$'))[1]),
  town = coalesce(town, trim(both from (regexp_match(address, ',\s*([^,]+?)\s*,\s*[A-Z]{2}\s*\d{5}'))[1])),
  street = coalesce(
    street,
    nullif(trim(both from regexp_replace(address, '\s*,\s*[^,]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\s*$', '')), '')
  )
where address is not null and (street is null or town is null or zip is null);
