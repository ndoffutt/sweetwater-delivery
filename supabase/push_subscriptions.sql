-- Web Push subscriptions for visit reminders. One row per device/browser that
-- opted in. Run in the Supabase SQL editor. Safe to run more than once.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  endpoint text not null unique,   -- the push service URL for this device
  p256dh text not null,            -- client public key (payload encryption)
  auth text not null,              -- client auth secret
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
