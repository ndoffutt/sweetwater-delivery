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
update customers set delivery_day = 'wednesday'
  where route_seq is not null and route_seq <= 25 and delivery_day is null;
update customers set delivery_day = 'thursday'
  where route_seq is not null and route_seq > 25 and delivery_day is null;
