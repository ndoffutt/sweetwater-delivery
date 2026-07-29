// Real-driving-distance route check for the dispatch screen.
//
// The console's own check uses straight-line distance, which is instant but can
// be badly wrong here — scored against the road network it captured as little as
// 22% of the available saving on the East Hampton run. This endpoint returns the
// road-distance verdict so the banner can upgrade itself once the answer arrives,
// without holding up the page.
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { checkRouteRoad } from "@/lib/routeCheck";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user || (user.role !== "dispatcher" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let stops: { id: string; lat: number | null; lng: number | null }[] = [];
  try {
    const body = (await request.json()) as { stops?: typeof stops };
    stops = Array.isArray(body.stops) ? body.stops : [];
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (stops.length > 200) return NextResponse.json({ error: "Too many stops" }, { status: 400 });

  const check = await checkRouteRoad(stops).catch(() => null);
  return NextResponse.json({ check });
}
