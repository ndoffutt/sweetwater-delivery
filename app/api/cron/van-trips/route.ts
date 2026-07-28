// Nightly pull of the van's Bouncie trips into van_trips, so the Time & motion
// report is built on how the vehicle actually moved rather than on driver taps.
// Runs after the delivery day is over. Idempotent — trips upsert on Bouncie's
// transaction_id, so re-running or overlapping windows can't duplicate rows.
//
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
// Manual run (owner, from the browser): POST via the Reports page sync button.
import { NextRequest, NextResponse } from "next/server";
import { syncVanTrips } from "@/lib/vanTrips";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Two weeks of overlap so a night of downtime can't leave a permanent hole.
  const synced = await syncVanTrips(14);
  return NextResponse.json({
    ok: true,
    synced,
    note: synced === null ? "bouncie unconfigured or van_trips table missing" : undefined,
  });
}
