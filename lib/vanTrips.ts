import { createAdminClient } from "@/lib/supabase/admin";
import { getTrips } from "@/lib/bouncie";

export interface VanTripRow {
  transaction_id: string;
  started_at: string;
  ended_at: string;
  distance: number | null;
  idle_seconds: number | null;
  hard_braking: number | null;
  hard_acceleration: number | null;
  max_speed: number | null;
}

/**
 * Pull the last `days` of trips from Bouncie into van_trips.
 * Idempotent: rows are upserted on Bouncie's stable transaction_id, so
 * re-running only refreshes what is already there. Returns how many trips were
 * written, or null when Bouncie isn't configured / the table doesn't exist yet.
 */
export async function syncVanTrips(days = 14): Promise<number | null> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);

  const trips = await getTrips(from, to);
  if (trips.length === 0) return 0;

  const rows = trips
    .filter((t) => t.transactionId && t.startTime && t.endTime)
    .map((t) => ({
      transaction_id: t.transactionId,
      imei: t.imei,
      started_at: t.startTime,
      ended_at: t.endTime,
      distance: t.distance ?? null,
      average_speed: t.averageSpeed ?? null,
      max_speed: t.maxSpeed ?? null,
      idle_seconds: t.totalIdleDuration ?? null,
      hard_braking: t.hardBrakingCount ?? 0,
      hard_acceleration: t.hardAccelerationCount ?? 0,
      start_odometer: t.startOdometer ?? null,
      end_odometer: t.endOdometer ?? null,
      fuel_consumed: t.fuelConsumed ?? null,
      time_zone: t.timeZone ?? null,
      gps: t.gps ?? null,
      synced_at: new Date().toISOString(),
    }));

  const supabase = createAdminClient();
  const { error } = await supabase.from("van_trips").upsert(rows, { onConflict: "transaction_id" });
  // Table not created yet: degrade quietly, exactly like the rest of the app.
  if (error) return null;
  return rows.length;
}

/**
 * Sync only if the stored trips have gone stale, so opening Reports doesn't pay
 * for a Bouncie round-trip on every view. The nightly cron does the real work;
 * this just keeps today's numbers current between runs.
 */
export async function syncVanTripsIfStale(maxAgeMinutes = 120): Promise<number | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("van_trips")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null; // table missing — nothing to do
    const last = data?.synced_at ? new Date(data.synced_at).getTime() : 0;
    if (Date.now() - last < maxAgeMinutes * 60_000) return 0;
  } catch {
    return null;
  }
  return syncVanTrips(7);
}

/** One drive leg, as the vehicle actually recorded it. */
export interface TripLeg {
  day: string; // Eastern YYYY-MM-DD
  driveMin: number;
  distance: number | null;
  idleMin: number;
  hardEvents: number;
  /** Minutes parked after this leg before the next one began — time at a stop. */
  stopAfterMin: number | null;
}

// A parked gap longer than this isn't a delivery stop — it's lunch, the end of
// the shift, or the van sitting at the shop. Counting those as "time on site"
// would wreck the average.
export const MAX_STOP_MIN = 90;

/**
 * Convert raw trips into per-day drive legs and the parked gaps between them.
 * Gaps are only measured between two trips on the SAME Eastern day, so an
 * overnight park never counts as a stop.
 */
export function deriveLegs(trips: VanTripRow[], easternDayOf: (iso: string) => string): TripLeg[] {
  const sorted = trips
    .slice()
    .sort((a, b) => (a.started_at < b.started_at ? -1 : 1));

  return sorted.map((t, i) => {
    const start = new Date(t.started_at).getTime();
    const end = new Date(t.ended_at).getTime();
    const day = easternDayOf(t.started_at);
    const next = sorted[i + 1];
    let stopAfterMin: number | null = null;
    if (next && easternDayOf(next.started_at) === day) {
      const gap = Math.round((new Date(next.started_at).getTime() - end) / 60000);
      if (gap >= 0 && gap <= MAX_STOP_MIN) stopAfterMin = gap;
    }
    return {
      day,
      driveMin: Math.max(0, Math.round((end - start) / 60000)),
      distance: t.distance ?? null,
      idleMin: Math.round((t.idle_seconds ?? 0) / 60),
      hardEvents: (t.hard_braking ?? 0) + (t.hard_acceleration ?? 0),
      stopAfterMin,
    };
  });
}

/** Trips overlapping a date range, oldest first. Empty when the table is absent. */
export async function loadVanTrips(sinceIso: string): Promise<VanTripRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("van_trips")
    .select("transaction_id,started_at,ended_at,distance,idle_seconds,hard_braking,hard_acceleration,max_speed")
    .gte("started_at", sinceIso)
    .order("started_at", { ascending: true })
    .limit(5000);
  if (error) return [];
  return (data ?? []) as VanTripRow[];
}
