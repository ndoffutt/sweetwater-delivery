// Daily visit-reminder push. Fires 8am Eastern (12:00 UTC EDT — drifts to 7am
// in winter; a 1-hour DST drift is acceptable, same as the weekly report).
// Pushes a single notification listing how many prospects (New / Working /
// Active) haven't been visited in 30+ days.
//
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
// Manual test: GET /api/cron/visit-reminders?dry=1 (same Bearer header) to see
// the count without sending.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOverdueForVisit } from "@/lib/prospectVisit";
import { sendPushToAll, pushConfigured } from "@/lib/push";
import type { Prospect } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prospects")
    .select("status, created_at, touchpoints:prospect_touchpoints(type, created_at)")
    .is("deleted_at", null)
    .in("status", ["new", "working", "active"]);

  const count = ((data ?? []) as unknown as Prospect[]).filter(isOverdueForVisit).length;

  if (count === 0) return NextResponse.json({ status: "ok", count: 0, sent: 0 });
  if (!pushConfigured()) return NextResponse.json({ status: "push-not-configured", count });
  if (dry) return NextResponse.json({ status: "dry-run", count });

  const result = await sendPushToAll({
    title: "Sweetwater's — visit reminders",
    body:
      count === 1
        ? "1 prospect hasn't been visited in 30+ days. Tap to see it."
        : `${count} prospects haven't been visited in 30+ days. Tap to see them.`,
    url: "/sales/prospects",
  });
  return NextResponse.json({ status: "sent", count, ...result });
}
