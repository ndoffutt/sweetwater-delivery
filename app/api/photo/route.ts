import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parsing the multipart body has been failing in production with
  // "no boundary found in multipart body" — the body arrives empty or truncated,
  // so undici can't find the boundary the Content-Type header promises. Let it
  // surface as a retryable 503 (never 400, which makes the offline queue delete
  // the photo) and log what actually arrived so the cause is visible next time.
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error("[photo] multipart parse failed", {
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      transferEncoding: request.headers.get("transfer-encoding"),
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Could not read upload" }, { status: 503 });
  }

  const file = formData.get("photo") as File | null;
  const stopId = formData.get("stopId") as string | null;
  const rawKind = formData.get("kind");
  const kind = rawKind === "dropoff" || rawKind === "pickup" ? rawKind : null;

  // A body that parsed but arrived without its parts is the same truncation
  // problem, not a bad client — 503 so the queue retries instead of discarding.
  if (!file || typeof file === "string" || file.size === 0) {
    console.error("[photo] upload missing/empty file part", {
      contentLength: request.headers.get("content-length"),
      keys: Array.from(formData.keys()),
    });
    return NextResponse.json({ error: "Upload incomplete" }, { status: 503 });
  }
  if (!stopId) {
    return NextResponse.json({ error: "Missing stopId" }, { status: 400 });
  }

  // Vercel rejects request bodies over ~4.5MB before this handler even runs, so
  // treat anything near that as too big. 413 (never 400) — the client drops a
  // photo on 400, and proof photos must never be destroyed for being too large.
  // On 413 the client re-compresses the stored blob and retries.
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: "Photo too large" }, { status: 413 });
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
