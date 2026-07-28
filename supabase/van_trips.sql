-- Trips pulled from the van's Bouncie OBD device. This is the device-truthful
-- record of how the van actually moved: each row is one engine-on drive leg.
--
-- Drive time comes from a trip's own duration; time at a stop comes from the gap
-- between one trip ending and the next beginning. Neither depends on the driver
-- remembering to tap "arrive" / "complete", which is why the tap-derived numbers
-- were unreliable.
create table if not exists van_trips (
  transaction_id   text primary key,          -- Bouncie's stable per-trip id
  imei             text not null,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  distance         numeric,                   -- miles
  average_speed    numeric,                   -- mph
  max_speed        numeric,                   -- mph
  idle_seconds     integer,                   -- totalIdleDuration
  hard_braking     integer default 0,
  hard_acceleration integer default 0,
  start_odometer   numeric,
  end_odometer     numeric,
  fuel_consumed    numeric,
  time_zone        text,
  gps              text,                      -- encoded polyline of the path
  synced_at        timestamptz not null default now()
);

create index if not exists van_trips_started_at_idx on van_trips (started_at desc);
