-- Small key/value store for switches that need to change RIGHT NOW.
--
-- These started as Vercel env vars, which was wrong for this shop: an env
-- change doesn't take effect until a redeploy, so killing a misfiring
-- customer text meant opening a laptop, editing a variable and waiting on a
-- build. From here it's a toggle on a phone that takes effect on the next
-- request.
--
-- Keys in use:
--   auto_texts_on       '1' | '0'  — master switch for automated customer texts
--   auto_texts_test_to  phone      — while set, automated texts go HERE instead
--                                    of to customers (dry run)
create table if not exists app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by text
);
