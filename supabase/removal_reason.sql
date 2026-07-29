-- Why a stop or prospect visit was pulled off a route (e.g. "out of town").
-- Set in the same UPDATE that soft-deletes the row, so the existing
-- deletion_audit trigger (which snapshots to_jsonb(new) — the POST-update row)
-- captures it automatically. No trigger changes needed.
alter table route_stops add column if not exists removal_reason text;
alter table route_prospect_visits add column if not exists removal_reason text;
