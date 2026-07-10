-- Out-of-range customers: too far to service right now, shelved from the
-- delivery list without deleting them. They stay in the directory (findable
-- under the "Out of range" filter) and can be brought back any time.
--
-- Distinct from `active`/`deleted_at` (soft-delete). Out-of-range keeps the
-- customer active; it only hides them from route building + the master route.
alter table customers
  add column if not exists out_of_range boolean not null default false;
