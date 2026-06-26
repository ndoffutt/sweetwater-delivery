-- Soft-delete everywhere + deletion audit log.
--
-- Goal: every user-initiated delete is recoverable, attributed, and
-- surfaced in the Settings → Recently Deleted card. No more lost rows.
--
-- After this migration:
--   1. The previously-hard-deleted tables (prospect_touchpoints,
--      route_prospect_visits, route_stops, stop_photos, text_messages)
--      gain a deleted_at + deleted_by column. App code switches from
--      .delete() to .update({deleted_at, deleted_by}).
--   2. A single deletion_audit table captures every soft-delete with the
--      full before-state row as jsonb so the UI can render a useful label
--      ("Hedges Inn", "Note on Peserico", etc.) without a separate join.
--   3. A generic trigger fires whenever deleted_at flips null → not-null
--      on any audited table. SECURITY DEFINER so it runs with table
--      privileges regardless of who initiated the delete.
--
-- Idempotent: safe to re-run.

-- ── Add soft-delete columns to the tables that lacked them ─────────
alter table public.prospect_touchpoints
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

alter table public.route_prospect_visits
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

alter table public.route_stops
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

alter table public.stop_photos
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

alter table public.text_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id);

-- Backfill deleted_by on tables that already had deleted_at (the previously
-- soft-deleted prospects/customers/routes/users rows don't carry attribution).
alter table public.prospects
  add column if not exists deleted_by uuid references public.users(id);
alter table public.customers
  add column if not exists deleted_by uuid references public.users(id);
alter table public.routes
  add column if not exists deleted_by uuid references public.users(id);
alter table public.users
  add column if not exists deleted_by uuid references public.users(id);

-- ── Audit table ─────────────────────────────────────────────────────
create table if not exists public.deletion_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  before_state jsonb not null,
  deleted_by uuid references public.users(id),
  deleted_by_name text,
  deleted_at timestamptz not null default now()
);

create index if not exists deletion_audit_table_idx on public.deletion_audit(table_name, deleted_at desc);
create index if not exists deletion_audit_recent_idx on public.deletion_audit(deleted_at desc);

-- ── Generic trigger function ────────────────────────────────────────
-- Fires when deleted_at flips from null → not-null on any audited table.
-- Captures the full row + the actor (via new.deleted_by). Denormalizes the
-- actor's name so the audit log keeps reading well even if a user is
-- renamed later.
create or replace function public.log_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if (tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null) then
    if new.deleted_by is not null then
      select name into actor_name from public.users where id = new.deleted_by;
    end if;
    insert into public.deletion_audit (table_name, row_id, before_state, deleted_by, deleted_by_name)
    values (tg_table_name, new.id, to_jsonb(new), new.deleted_by, actor_name);
  end if;
  return new;
end;
$$;

-- ── Attach trigger to every audited table ───────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'customers',
    'prospects',
    'prospect_touchpoints',
    'routes',
    'route_stops',
    'route_prospect_visits',
    'stop_photos',
    'text_messages',
    'users'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_log_soft_delete on public.%I', t);
    execute format(
      'create trigger trg_log_soft_delete after update of deleted_at on public.%I for each row execute function public.log_soft_delete()',
      t
    );
  end loop;
end $$;
