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
