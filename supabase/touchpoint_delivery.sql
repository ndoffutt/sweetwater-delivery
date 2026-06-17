-- Add a 'delivery' touchpoint type so a delivery to an active prospect is
-- logged as its own kind (van icon) rather than a plain visit. Still counts
-- toward "last visited" so served accounts don't show overdue.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table prospect_touchpoints drop constraint if exists prospect_touchpoints_type_check;
alter table prospect_touchpoints add constraint prospect_touchpoints_type_check
  check (type in ('call', 'email', 'text', 'visit', 'delivery', 'note'));
