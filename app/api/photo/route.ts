import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;
  const stopId = formData.get("stopId") as string | null;
  const rawKind = formData.get("kind");
  const kind = rawKind === "dropoff" || rawKind === "pickup" ? rawKind : null;

  if (!file || !stopId) {
    return NextResponse.json({ error: "Missing photo or stopId" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Reject photos for stops that no longer exist (e.g. the route was cleared)
  // with a 400 so the offline upload queue drops them instead of retrying.
  const { data: stop } = await supabase
    .from("route_stops")
    .select("id")
    .eq("id", stopId)
    .maybeSingle();
  if (!stop) {
    return NextResponse.json({ error: "Stop not found" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${stopId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("stop-photos")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  let { error: dbError } = await supabase.from("stop_photos").insert({
    stop_id: stopId,
    storage_path: path,
    ...(kind ? { kind } : {}),
  });

  // Tolerant of the photo_kinds migration not having run yet: retry unlabeled.
  if (dbError && kind && /kind|column|schema cache/i.test(dbError.message)) {
    ({ error: dbError } = await supabase.from("stop_photos").insert({
      stop_id: stopId,
      storage_path: path,
    }));
  }

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("stop-photos")
    .getPublicUrl(path);

  return NextResponse.json({ success: true, url: urlData.publicUrl });
}
