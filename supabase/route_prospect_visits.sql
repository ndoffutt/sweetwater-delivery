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
