-- Sales priority for prospects: low / medium / high. Drives sorting and a
-- colored tag in the directory. Run in the Supabase SQL editor. Safe to re-run.

alter table prospects add column if not exists priority text not null default 'medium';

alter table prospects drop constraint if exists prospects_priority_check;
alter table prospects add constraint prospects_priority_check
  check (priority in ('low', 'medium', 'high'));
