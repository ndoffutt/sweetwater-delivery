// Lightweight poll target for the driver app: just the current set of stop ids
// for a route. Dispatch can add a stop to an already-out route (a walk-in, a
// missed pickup); the driver's page is server-rendered and won't see it until
// something triggers a refresh. DriverMap polls this and calls router.refresh()
// when the id set changes, so a newly added stop shows up on its own.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const routeId = request.nextUrl.searchParams.get("routeId");
  if (!routeId) return NextResponse.json({ error: "Missing routeId" }, { status: 400 });

  const supabase = createAdminClient();
  let { data, error } = await supabase
    .from("route_stops")
    .select("id")
    .eq("route_id", routeId)
    .is("deleted_at", null);
  if (error && /deleted_at/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message)) {
    ({ data, error } = await supabase.from("route_stops").select("id").eq("route_id", routeId));
  }

  // On a real query failure, return null (not an empty list) so the client
  // treats it as "couldn't check this time" rather than "route is now empty" —
  // an empty-ids false positive would trigger a refresh loop.
  if (error) return NextResponse.json({ ids: null });
  return NextResponse.json({ ids: (data ?? []).map((r) => r.id as string) });
}
