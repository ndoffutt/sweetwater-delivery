-- The weekly update, done in the app instead of assembled by hand.
--
-- Format and hard rules live in the brain wiki (wiki/operations.md) and are
-- reproduced in lib/weeklyUpdate.ts. The app fills what it knows (customer
-- issues from delivery exceptions, touchpoints, active opportunities) and the
-- rest is entered here.

create table if not exists weekly_updates (
  id            uuid primary key default gen_random_uuid(),
  -- Monday-anchored week this update covers. One update per week.
  week_start    date not null unique,

  -- Revenue: weekly dollars only. Every derived figure the format demands
  -- (YTD % vs prior year, % vs goal, dollar gap to goal) is calculated, never
  -- stored, so a corrected prior-year number reflows everything.
  sweetwater_revenue numeric,
  jrs_revenue        numeric,
  delivery_revenue   numeric,
  sweetwater_ytd     numeric,
  jrs_ytd            numeric,
  delivery_ytd       numeric,
  sweetwater_ytd_prior numeric,
  jrs_ytd_prior        numeric,
  delivery_ytd_prior   numeric,

  -- Operations status. 'Green' | 'Yellow' | 'Red'.
  staffing_status   text,
  staffing_note     text,
  equipment_status  text,
  equipment_note    text,
  blocking_growth   text,        -- 'None' or the detail

  key_updates       text,        -- one per line
  -- Only rendered when an expectation was missed; omitted entirely otherwise.
  expectation_note  text,

  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Action items are real records, not free text: owners are named individuals,
-- items carry over between weeks until done, and a finished one shows as
-- "(Completed)" in the week it was completed and disappears the week after.
create table if not exists action_items (
  id            uuid primary key default gen_random_uuid(),
  owner         text not null,          -- a person's name, never a generic label
  action        text not null,
  section       text not null default 'operations',  -- 'operations' | 'growth'
  opened_week   date not null,
  completed_week date,
  completed_at  timestamptz,
  created_by    text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid references public.users(id)
);

create index if not exists action_items_open_idx on action_items (completed_week, opened_week desc);
create index if not exists weekly_updates_week_idx on weekly_updates (week_start desc);
