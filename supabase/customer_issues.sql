-- Customer issues on the weekly update.
--
-- These used to be three counts auto-derived from the delivery exception log,
-- which only ever knew about things the app itself could see (a skipped stop,
-- a missing photo). The issues that actually matter — a complaint on the
-- phone, a damaged garment, a billing dispute — never touched the app, so the
-- section was measuring the wrong thing.
--
-- Now the manager writes them in each week, and an unresolved issue carries
-- forward until someone marks it resolved. `resolved_week` records the week it
-- was closed in, so a week's update can show what was closed during it rather
-- than just what's open today.
create table if not exists customer_issues (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  customer_name text,
  opened_week date not null,
  resolved_week date,
  resolved_at timestamptz,
  created_by text,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_issues_open_idx
  on customer_issues(opened_week desc) where deleted_at is null;
