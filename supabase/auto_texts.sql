-- Per-customer opt-out for AUTOMATED texts (arrive/complete/out-for-delivery
-- auto-sends). Commercial accounts default OFF: Nate doesn't want auto-texts
-- going to business contacts (linen accounts, prop managers, etc). Manual
-- sends from the Messages inbox are unaffected either way — this only gates
-- lib/actions/stops.ts's autoText()/notifyRouteStarted().
alter table customers add column if not exists auto_texts_enabled boolean not null default true;

update customers set auto_texts_enabled = false
where auto_texts_enabled
  and (
    'Commercial' = any(tags)
    or id in (select customer_id from prospects where customer_id is not null and deleted_at is null)
  );

-- When the van actually left the shop: stamped the first time the driver taps
-- Navigate on a stop. Distinct from started_at, which is set when the first
-- stop is marked ARRIVED — by then the van is already at a customer, too late
-- for an out-for-delivery heads-up. Doubles as the once-per-route guard for
-- that text, so a retry (Hamptons dead zones) can't double-text anyone.
alter table routes add column if not exists departed_at timestamptz;
