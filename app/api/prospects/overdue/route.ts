import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { needsAttention } from "@/lib/prospectVisit";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/prospects/overdue -> { count } of prospects overdue for a visit.
// Powers the reminder badge on the Sales nav / home card.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("status, priority, created_at, manual_request_at, touchpoints:prospect_touchpoints(type, created_at)")
    .is("deleted_at", null)
    .in("status", ["new", "working", "active"]);

  if (error) return NextResponse.json({ count: 0 });

  const count = ((data ?? []) as unknown as Prospect[]).filter(needsAttention).length;
  return NextResponse.json({ count });
}
