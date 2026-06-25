-- Add two prospect flags:
--   call_only          — no physical location, phone/email-only outreach.
--                        Hidden from the map; address becomes optional.
--   manual_request_at  — dispatcher-set "please reach out" flag. Forces the
--                        prospect into the overdue list regardless of cadence.
--                        Cleared by the next non-note touchpoint.
--
-- Idempotent: safe to re-run.
alter table public.prospects
  add column if not exists call_only boolean not null default false;

alter table public.prospects
  add column if not exists manual_request_at timestamptz;

-- Trigger: any non-note touchpoint clears the manual request flag for that
-- prospect. Notes are explicitly internal-only and do not satisfy a request.
create or replace function public.clear_manual_request_on_touchpoint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'note' then
    update public.prospects
       set manual_request_at = null
     where id = new.prospect_id
       and manual_request_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_manual_request_on_touchpoint on public.prospect_touchpoints;
create trigger trg_clear_manual_request_on_touchpoint
after insert on public.prospect_touchpoints
for each row
execute function public.clear_manual_request_on_touchpoint();
