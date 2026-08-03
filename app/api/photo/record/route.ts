import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Record a photo that the phone has already uploaded straight to Storage.
 *
 * The payload is a few hundred bytes of JSON, which matters: a body this small
 * fits inside fetch(keepalive: true), so the write can still complete after the
 * app loses the foreground. That is exactly the moment the old multipart upload
 * was dying.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { stopId?: string; path?: string; kind?: string }
    | null;

  const stopId = body?.stopId;
  const path = body?.path;
  if (!stopId || !path) return NextResponse.json({ error: "Missing stopId or path" }, { status: 400 });

  // Only ever write inside this stop's own folder, whatever the client sends.
  if (!path.startsWith(`${stopId}/`)) {
    return NextResponse.json({ error: "Path does not belong to that stop" }, { status: 400 });
  }

  const kind = body?.kind === "dropoff" || body?.kind === "pickup" ? body.kind : null;
  const supabase = createAdminClient();

  let { error } = await supabase.from("stop_photos").insert({
    stop_id: stopId,
    storage_path: path,
    ...(kind ? { kind } : {}),
  });

  // Tolerant of the photo_kinds migration not having run yet: retry unlabeled
  // rather than losing the proof over a column that doesn't exist.
  if (error && kind && /kind|column|schema cache/i.test(error.message)) {
    ({ error } = await supabase.from("stop_photos").insert({
      stop_id: stopId,
      storage_path: path,
    }));
  }

  if (error) {
    // A foreign-key failure means the stop is gone: permanent, so 400 lets the
    // queue drop it. Anything else is worth retrying.
    const permanent = /foreign key|violates|not present/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: permanent ? 400 : 503 });
  }

  const { data: urlData } = supabase.storage.from("stop-photos").getPublicUrl(path);
  return NextResponse.json({ success: true, url: urlData.publicUrl });
}
