// Close routes that were started and never finished.
//
// Drivers tap "arrived" at the last stop of the day and then just go home, so
// the stop stays open and maybeCompleteRoute() never fires. The route sits
// in_progress forever, clutters dispatch, and quietly skews any report that
// counts open work. As of 2026-08-03 there were six of them, the oldest 32 days
// old.
//
// This sweep closes any route still in_progress or dispatched 24 hours after it
// started. Routes run Wednesday and Thursday, so 24h guarantees a stalled route
// is closed before the next one starts rather than sitting in dispatch beside
// it. It deliberately does NOT touch stop statuses: a stop left on
// "arrived" is an honest record that nobody confirmed the delivery, and
// rewriting it to completed or skipped would invent history. The open stops are
// the audit trail for why the route needed sweeping.
//
// completed_at is backdated to the last real activity on the route rather than
// set to now, so a route swept weeks later doesn't report a 32-day workday.

import { createAdminClient } from "@/lib/supabase/admin";

export const STALE_AFTER_HOURS = 24;

export interface SweptRoute {
  id: string;
  date: string;
  previousStatus: string;
  completedAt: string;
  openStops: number;
  hoursOpen: number;
}

export async function sweepStaleRoutes(
  now: Date = new Date()
): Promise<{ swept: SweptRoute[]; checked: number }> {
  const supabase = createAdminClient();
  const cutoff = new Date(now.getTime() - STALE_AFTER_HOURS * 3600_000);

  const { data: routes, error } = await supabase
    .from("routes")
    .select("id, date, status, started_at")
    .is("deleted_at", null)
    .in("status", ["dispatched", "in_progress"]);
  if (error || !routes?.length) return { swept: [], checked: routes?.length ?? 0 };

  const swept: SweptRoute[] = [];

  for (const r of routes as { id: string; date: string; status: string; started_at: string | null }[]) {
    // A dispatched route may never have been started, so fall back to the end
    // of its delivery day before deciding it is stale.
    const startedAt = r.started_at ? new Date(r.started_at) : new Date(`${r.date}T23:59:59Z`);
    if (startedAt > cutoff) continue;

    // Backdate to the last stop the driver actually finished. If they finished
    // nothing, the start time is the only defensible timestamp we have.
    const { data: stops } = await supabase
      .from("route_stops")
      .select("status, completed_at, arrived_at")
      .eq("route_id", r.id)
      .is("deleted_at", null);

    const live = (stops ?? []) as {
      status: string;
      completed_at: string | null;
      arrived_at: string | null;
    }[];
    const stamps = live
      .flatMap((s) => [s.completed_at, s.arrived_at])
      .filter((t): t is string => Boolean(t))
      .sort();
    const completedAt = stamps.length ? stamps[stamps.length - 1] : startedAt.toISOString();

    const { error: updErr } = await supabase
      .from("routes")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", r.id)
      // Guard against a driver finishing the route between the read and the
      // write. Only sweep if it is still in the status we saw.
      .eq("status", r.status);
    if (updErr) continue;

    swept.push({
      id: r.id,
      date: r.date,
      previousStatus: r.status,
      completedAt,
      openStops: live.filter((s) => s.status === "pending" || s.status === "arrived").length,
      hoursOpen: Math.round((now.getTime() - startedAt.getTime()) / 3600_000),
    });
  }

  return { swept, checked: routes.length };
}
