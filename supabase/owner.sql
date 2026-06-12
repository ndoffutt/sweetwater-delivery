-- Owner login (admin role) — run in the Supabase SQL Editor.
-- Owner PIN: 2968. Admin is a superset of dispatcher used for owner-level
-- surfaces (Sales/Prospects) and testing.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('driver', 'dispatcher', 'admin'));

insert into users (name, role, pin_hash)
select 'Owner', 'admin', encode(digest('2968' || 'sw-delivery-2026', 'sha256'), 'hex')
where not exists (select 1 from users where role = 'admin' and deleted_at is null);
