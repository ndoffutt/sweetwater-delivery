-- Messaging v2: replies, tapbacks, media, contacts, pin/archive.
-- Run this in the Supabase SQL editor AFTER supabase/messaging.sql.
-- Safe to run more than once.
--
-- The app degrades gracefully if this hasn't been run: threads and plain
-- send/receive keep working, and only the new features stay dark.

-- ── messages: reply threading, tapbacks, MMS ──────────────────────────

-- Quote-reply, iMessage style. Points at the message being replied to.
alter table messages
  add column if not exists reply_to_id uuid references messages(id) on delete set null;

-- Tapback on a message ("love" | "like" | "dislike" | "laugh" | "emphasize"
-- | "question"). One per message, matching how iMessage shows a single
-- reaction per sender in a 1:1 thread.
alter table messages
  add column if not exists reaction text;

-- MMS: Twilio delivers media as URLs, so keep the list rather than the bytes.
alter table messages
  add column if not exists media_urls text[];

create index if not exists messages_reply_idx on messages (reply_to_id);

-- ── message_contacts: names for numbers that aren't customers ─────────
--
-- Display name for a thread resolves customer -> prospect -> this table ->
-- the raw phone number. Keyed by the last 10 digits so "+16315551234" and
-- "(631) 555-1234" are the same contact.

create table if not exists message_contacts (
  phone_digits text primary key,
  name text not null,
  company text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres has no "create trigger if not exists", so drop first to keep this
-- script re-runnable.
drop trigger if exists message_contacts_updated_at on message_contacts;
create trigger message_contacts_updated_at
  before update on message_contacts
  for each row execute function set_updated_at();

-- ── conversation_meta: per-thread state ──────────────────────────────

create table if not exists conversation_meta (
  phone_digits text primary key,
  pinned_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists conversation_meta_updated_at on conversation_meta;
create trigger conversation_meta_updated_at
  before update on conversation_meta
  for each row execute function set_updated_at();

create index if not exists conversation_meta_pinned_idx
  on conversation_meta (pinned_at) where pinned_at is not null;
