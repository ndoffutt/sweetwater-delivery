-- Persisted route position for prospect visits.
--
-- Before this migration, prospect visits were dynamically interleaved into
-- the delivery sequence at render time via cheapest-insertion. The order
-- shifted every render, dispatcher couldn't reorder, and call-only
-- prospects always slid silently to the end.
--
-- After: every prospect visit owns a stop_order integer that lives in the
-- same numbered sequence as route_stops.stop_order. The driver, dispatch,
-- and history views read both tables and sort by that single number.
--
-- Idempotent: safe to re-run.
alter table public.route_prospect_visits
  add column if not exists stop_order integer;

-- Backfill any existing rows so they fall after the last delivery stop on
-- their route. New rows arriving via addProspectToTodaysRoute get a real
-- cheapest-insertion slot from the server action.
update public.route_prospect_visits rpv
   set stop_order = sub.next_order + rn - 1
  from (
    select
      rpv2.id,
      row_number() over (partition by rpv2.route_id order by rpv2.created_at) as rn,
      coalesce(
        (select max(stop_order) + 1 from public.route_stops where route_id = rpv2.route_id),
        1
      ) as next_order
    from public.route_prospect_visits rpv2
    where rpv2.stop_order is null
  ) sub
 where rpv.id = sub.id
   and rpv.stop_order is null;

create index if not exists route_prospect_visits_order_idx
  on public.route_prospect_visits(route_id, stop_order);
