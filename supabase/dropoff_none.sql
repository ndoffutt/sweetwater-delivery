-- route_stops.dropoff_none — the driver went, but there was nothing to drop off
-- (a pickup-only visit at a stop that was scheduled for a drop-off). Mirrors
-- pickup_none: satisfies the drop-off obligation without a photo and without a
-- skip, so the driver can complete the stop on the pickup alone.
alter table route_stops
  add column if not exists dropoff_none boolean not null default false;
