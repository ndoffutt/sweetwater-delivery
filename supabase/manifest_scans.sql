-- Dispatch console: store each scanned SPOT manifest so the empty state can show
-- the "last scanned manifest" preview (sheet thumbnail + what Claude pulled).
-- Run in the Supabase SQL Editor. (The private `manifests` storage bucket is
-- created separately via the storage API.)

create table if not exists manifest_scans (
  id uuid primary key default gen_random_uuid(),
  image_path text,                 -- path in the `manifests` storage bucket (null for CSV)
  source text not null default 'photo',  -- 'photo' | 'pdf' | 'csv'
  stops jsonb not null default '[]',     -- the extracted stops, as returned to the UI
  stop_count integer not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists manifest_scans_created_at on manifest_scans(created_at desc);
