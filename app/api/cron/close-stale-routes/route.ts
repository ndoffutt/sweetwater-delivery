// Daily sweep: close routes that were started and never finished. See
// lib/routeSweep.ts for why this exists and what it deliberately leaves alone.
//
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
// Idempotent — a route already completed is not in the query, so re-running or
// overlapping invocations cannot double-close anything.
import { NextRequest, NextResponse } from "next/server";
import { sweepStaleRoutes, STALE_AFTER_HOURS } from "@/lib/routeSweep";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { swept, checked } = await sweepStaleRoutes();
  return NextResponse.json({
    ok: true,
    staleAfterHours: STALE_AFTER_HOURS,
    checked,
    closed: swept.length,
    routes: swept,
  });
}
