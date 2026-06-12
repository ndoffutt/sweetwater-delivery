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
