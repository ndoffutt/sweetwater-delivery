import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lat, lng, accuracy, routeId } = await request.json();

  const supabase = createAdminClient();
  const { error } = await supabase.from("driver_locations").insert({
    driver_id: user.id,
    route_id: routeId || null,
    lat,
    lng,
    accuracy,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
