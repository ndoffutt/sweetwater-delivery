import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { easternToday } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user || user.role !== "dispatcher")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const today = easternToday();

  // Today's active route (in_progress preferred, else dispatched/draft).
  const { data: route } = await supabase
    .from("routes")
    .select(
      `id, date, status, started_at, completed_at,
       route_stops(id, route_id, customer_id, stop_order, status,
         has_dropoff, has_pickup, dropoff_confirmed, pickup_confirmed,
         notes, arrived_at, completed_at,
         customer:customers(id, name, address, lat, lng))`
    )
    .eq("date", today)
    .is("deleted_at", null)
    .order("stop_order", { referencedTable: "route_stops" })
    .maybeSingle();

  if (!route) return NextResponse.json({ route: null, driver: null });

  // Latest driver location ping for this route.
  let driver = null;
  const { data: loc } = await supabase
    .from("driver_locations")
    .select("lat, lng, accuracy, created_at")
    .eq("route_id", route.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  driver = loc;

  return NextResponse.json({ route, driver });
}
