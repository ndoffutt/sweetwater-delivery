-- Manager console additions to the customers table. Run in the Supabase SQL Editor.
-- tags     -> VIP / Seasonal / Commercial filters + VIP star
-- spot_account / account_type -> SPOT account ref + Delivery/A-R badge

alter table customers add column if not exists tags text[] not null default '{}';
alter table customers add column if not exists spot_account text;
alter table customers add column if not exists account_type text;
