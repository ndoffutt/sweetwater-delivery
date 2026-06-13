-- Reset the team to just the two accounts in use: Nate (Owner, PIN 2968) and
-- Ahsin (Manager, PIN 0000). Retires everyone else (old drivers, test logins).
-- Run in the Supabase SQL editor. Safe to run more than once.

-- Retire all current accounts; the keepers are restored just below.
update users set active = false, deleted_at = now() where deleted_at is null;

do $$
begin
  -- Nate — Owner (admin), PIN 2968
  if exists (select 1 from users where role = 'admin') then
    update users
      set name = 'Nate', active = true, deleted_at = null,
          pin_hash = encode(digest('2968' || 'sw-delivery-2026', 'sha256'), 'hex')
      where id = (select id from users where role = 'admin' order by created_at limit 1);
  else
    insert into users (name, role, pin_hash)
      values ('Nate', 'admin', encode(digest('2968' || 'sw-delivery-2026', 'sha256'), 'hex'));
  end if;

  -- Ahsin — Manager (dispatcher), PIN 0000
  if exists (select 1 from users where role = 'dispatcher') then
    update users
      set name = 'Ahsin', active = true, deleted_at = null,
          pin_hash = encode(digest('0000' || 'sw-delivery-2026', 'sha256'), 'hex')
      where id = (select id from users where role = 'dispatcher' order by created_at limit 1);
  else
    insert into users (name, role, pin_hash)
      values ('Ahsin', 'dispatcher', encode(digest('0000' || 'sw-delivery-2026', 'sha256'), 'hex'));
  end if;
end $$;
