-- Every change to the running order of a route, and who made it.
--
-- Routes were driven in their planned order 0 times out of 9. Most of that
-- wasn't the driver ignoring the plan — on 2026-07-30 he ran it almost exactly
-- backwards, which is a sensible thing to do and completely invisible to the
-- office. Reordering stays his call; it just stops being silent.
--
-- kind:
--   confirm  — the pre-drive pass, setting the order he intends to drive
--   reorder  — a stop moved mid-route
--   skip     — a stop passed over for later
create table if not exists route_order_changes (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  kind text not null check (kind in ('confirm', 'reorder', 'skip')),
  -- Stop order before and after, as arrays of route_stops.id, so the change is
  -- reconstructable rather than just "something moved".
  before_order uuid[],
  after_order uuid[],
  -- Plain-English summary for History, written at the time so it never has to
  -- be re-derived from ids that may since have been deleted.
  summary text,
  changed_by text,
  -- Cleared once the office has seen it; drives the "needs a look" count.
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists route_order_changes_route_idx
  on route_order_changes(route_id, created_at desc);
create index if not exists route_order_changes_unseen_idx
  on route_order_changes(created_at desc) where seen_at is null;
