-- Critical flag on action items. Some items are "get to it this week" and some
-- are "the shop stops if this doesn't happen" — a flat list can't say which,
-- so the urgent one sits in the middle looking like everything else.
alter table action_items add column if not exists critical boolean not null default false;
