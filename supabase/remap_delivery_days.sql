-- Remap every positioned customer's geographic delivery day by route order:
--   route 1-31  -> Thursday (east)
--   route 32+   -> Wednesday (west)
-- Monday commercial accounts keep their Monday. Run in the Supabase SQL editor.

update customers
set delivery_days = (
  (case when 'monday' = any(delivery_days) then array['monday'] else array[]::text[] end)
  || (case when route_seq <= 31 then array['thursday'] else array['wednesday'] end)
)
where active and deleted_at is null and route_seq is not null;
