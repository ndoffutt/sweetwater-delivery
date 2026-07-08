-- "Needs attention" exceptions on the Today page are DERIVED from delivery data
-- (skipped stops, completed stops with no photo proof). This table only records
-- which ones the manager has marked resolved, so they stop surfacing.
-- Run in the Supabase SQL editor (staging first). Safe to run more than once.

create table if not exists exception_resolutions (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references route_stops(id) on delete cascade,
  -- what kind of exception was resolved for this stop: 'skipped' | 'nophoto'
  kind text not null check (kind in ('skipped', 'nophoto')),
  resolved_by text,
  resolved_at timestamptz not null default now(),
  unique (stop_id, kind)
);

create index if not exists exception_resolutions_stop_idx on exception_resolutions(stop_id);
