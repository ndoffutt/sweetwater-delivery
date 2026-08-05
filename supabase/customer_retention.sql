-- Customer retention: the accounts that used to spend and have gone quiet.
--
-- Deliberately its own table rather than columns on `customers`: this is a
-- periodic SPOT export keyed by the name SPOT prints, and many of these
-- accounts are counter/retail customers who were never delivery customers and
-- so have no `customers` row at all. Linking is best-effort via customer_id.
--
-- Refreshed by re-importing the export; `snapshot_at` says how stale the
-- numbers are, so nobody reads a three-month-old "last seen" as current.
create table if not exists customer_retention (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_id uuid references customers(id) on delete set null,
  first_seen date,
  last_seen date,
  orders integer,
  spend_2024 numeric,
  spend_2025 numeric,
  spend_2026 numeric,
  -- Worked/dismissed so a name can be taken off the list without deleting the
  -- history that put it there.
  status text not null default 'open' check (status in ('open', 'working', 'recovered', 'dismissed')),
  snapshot_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_retention_name_idx
  on customer_retention(lower(customer_name)) where deleted_at is null;
