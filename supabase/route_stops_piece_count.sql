-- Per-stop piece (garment) count for the driver app. Read from the SPOT
-- manifest and shown on each stop. Run in the Supabase SQL editor.
-- Safe to run more than once.

alter table route_stops add column if not exists piece_count integer;
