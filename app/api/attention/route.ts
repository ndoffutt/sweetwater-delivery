// Attention count for the Today nav badge: open delivery exceptions +
// check-ins due. Mirrors what the Today page's right rail shows.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { needsAttention } from "@/lib/prospectVisit";
import { getOpenExceptions } from "@/lib/actions/exceptions";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await verifySessionToken(token.value);
  if (!user || (user.role !== "dispatcher" && user.role !== "admin"))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [{ data }, exceptions] = await Promise.all([
    supabase
      .from("prospects")
      .select("status, priority, created_at, manual_request_at, touchpoints:prospect_touchpoints(type, created_at)")
      .is("deleted_at", null)
      .in("status", ["new", "working", "active"]),
    getOpenExceptions(14).catch(() => []),
  ]);
  const checkins = ((data ?? []) as unknown as Prospect[]).filter(needsAttention).length;
  return NextResponse.json({ count: checkins + exceptions.length, checkins, exceptions: exceptions.length });
}
