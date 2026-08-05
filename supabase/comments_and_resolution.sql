-- 1. Why an issue was closed.
--
-- "Resolved" on its own is a checkbox, not an answer. A month later nobody can
-- say whether the customer was refunded, the garment was replaced, or it just
-- stopped being mentioned — which matters most for the ones that come back.
alter table customer_issues add column if not exists resolution text;

-- 2. Comments on anything.
--
-- Deliberately one table keyed by (entity_type, entity_id) rather than a
-- comments table per thing. The alternative is a new table and a new set of
-- actions every time something becomes discussable.
--
-- entity_type in use: 'customer_issue' | 'action_item'
create table if not exists entity_comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  body text not null,
  author text,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists entity_comments_lookup_idx
  on entity_comments(entity_type, entity_id, created_at) where deleted_at is null;
