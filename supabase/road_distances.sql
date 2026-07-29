-- Cached driving distances between route points, from the Mapbox Matrix API.
--
-- Straight-line distance is a poor proxy out here: measured against real roads,
-- a crow-flies-optimised Thursday run captured only 22% of the available saving,
-- because the East Hampton road network doesn't resemble the crow-flies geometry.
-- Real road distances fix that, but calling Mapbox live is far too slow for the
-- dispatch screen (~26 matrix requests for a 50-stop run), so results are cached
-- here. Customer locations barely change, so the cache is almost always warm.
--
-- Keys are customer ids, with the literal 'shop' as the sentinel for the
-- Wainscott base that every run starts and ends at.
create table if not exists road_distances (
  from_id    text not null,
  to_id      text not null,
  miles      numeric not null,
  updated_at timestamptz not null default now(),
  primary key (from_id, to_id)
);

create index if not exists road_distances_from_idx on road_distances (from_id);
