-- Ops Hub additions. Requires weekly_updates.sql to have run first
-- (weekly_updates + action_items).
--
-- Comments attach to a SECTION of a week's update — the owner reads the
-- manager's numbers and pushes back right there instead of over text.
create table if not exists report_comments (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  section     text not null check (section in ('issues', 'operations', 'growth')),
  author      text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists report_comments_week_idx on report_comments (week_start, section, created_at);

-- Action item owner as a real person, not free text — picked from the team
-- (mirrors MCG's task assignee_id/name pattern). `owner` stays as the
-- denormalized display name, so old rows and a picker miss both still render.
alter table action_items add column if not exists owner_id uuid references users(id) on delete set null;
