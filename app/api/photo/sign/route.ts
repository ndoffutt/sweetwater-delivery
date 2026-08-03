import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Hand the phone a one-time URL to upload a photo straight into Supabase
 * Storage.
 *
 * The old path posted the image as multipart to /api/photo, which put a
 * serverless function between the camera and the bucket. That hop failed
 * 13,268 times in two days with "no boundary found in multipart body": the
 * body arrived empty, most likely because iOS suspended the app mid-request
 * when the driver switched to Google Maps.
 *
 * Uploading directly removes the hop entirely. Only tiny JSON crosses this
 * route, so there is no multipart body to lose and no 4.5MB platform limit on
 * the image itself.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { stopId?: string; type?: string } | null;
  const stopId = body?.stopId;
  if (!stopId) return NextResponse.json({ error: "Missing stopId" }, { status: 400 });

  const supabase = createAdminClient();

  // A stop cleared from the route is permanently gone. 400 tells the offline
  // queue to drop the photo instead of retrying it forever.
  const { data: stop } = await supabase
    .from("route_stops")
    .select("id")
    .eq("id", stopId)
    .maybeSingle();
  if (!stop) return NextResponse.json({ error: "Stop not found" }, { status: 400 });

  const ext = body?.type === "image/png" ? "png" : "jpg";
  const path = `${stopId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("stop-photos")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not sign upload" }, { status: 503 });
  }

  return NextResponse.json({ path: data.path, signedUrl: data.signedUrl, token: data.token });
}
