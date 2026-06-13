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
update customers
  set delivery_days = array[delivery_day]
  where delivery_day is not null
    and (delivery_days is null or delivery_days = '{}');

-- Standing twice-weekly commercial accounts: Brunello Cucinelli + Hedges Inn
-- deliver Monday and Thursday. No-op if those customers aren't in the directory.
update customers
  set delivery_days = array['monday', 'thursday']
  where lower(name) like 'brunello%'
     or lower(regexp_replace(name, '^the ', '')) like 'hedges%';
