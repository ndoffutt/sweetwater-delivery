-- Messaging: two-way SMS through the office number (Twilio Hosted SMS).
-- Run this in the Supabase SQL editor. Safe to run more than once.
--
-- One row per SMS, inbound or outbound. Threads are grouped by phone number
-- in the app (matched to customers by their last 10 digits), so texts from a
-- customer and replies from any device all live in one conversation.

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('inbound', 'outbound')),
  phone text not null,                                   -- customer's number as sent/received
  body text not null,
  customer_id uuid references customers(id) on delete set null,
  stop_id uuid references route_stops(id) on delete set null,
  sender_name text,                                      -- who sent an outbound msg (Manager / Driver / auto)
  status text not null default 'pending',                -- pending | sent | delivered | failed | received
  twilio_sid text,
  error text,
  read_at timestamptz,                                   -- inbound: when a staff member opened the thread
  created_at timestamptz not null default now()
);

create index if not exists messages_phone_idx on messages (phone, created_at desc);
create index if not exists messages_unread_idx on messages (read_at) where direction = 'inbound' and read_at is null;
create index if not exists messages_sid_idx on messages (twilio_sid);
