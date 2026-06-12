-- Roles v2: adds the 'admin' role alongside driver/dispatcher (manager).
-- The PIN you type at Staff Login decides which account you are:
--   Manager PIN 0000 (role: dispatcher) - drive, dispatch, sales
--   Admin   PIN 8888 (role: admin)      - drive, dispatch, sales (+ future admin-only)
-- CHANGE THE ADMIN PIN before running in production: edit '8888' below.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('driver', 'dispatcher', 'admin'));

insert into users (name, role, pin_hash, phone)
select 'Admin', 'admin', encode(digest('8888' || 'sw-delivery-2026', 'sha256'), 'hex'), null
where not exists (select 1 from users where role = 'admin' and deleted_at is null);
