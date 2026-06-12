import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { extractManifestStops, type ManifestStop } from "@/lib/manifest/extract";
import { parseManifestCsv } from "@/lib/manifest/csv";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user || user.role !== "dispatcher") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("manifest");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No manifest file provided" }, { status: 400 });
  }

  const mediaType = file.type || "image/jpeg";
  const isCsv =
    mediaType === "text/csv" ||
    mediaType === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(".csv");
  const isPdf = mediaType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  try {
    let stops: ManifestStop[];
    let source: "photo" | "pdf" | "csv";
    let imagePath: string | null = null;

    const supabase = createAdminClient();

    if (isCsv) {
      const text = await file.text();
      stops = parseManifestCsv(text);
      source = "csv";
    } else {
      const buf = Buffer.from(await file.arrayBuffer());
      const base64 = buf.toString("base64");
      const type = isPdf ? "application/pdf" : mediaType;
      stops = await extractManifestStops(base64, type);
      source = isPdf ? "pdf" : "photo";

      // Keep the original sheet so the empty state can show a preview later.
      const ext = isPdf ? "pdf" : type === "image/png" ? "png" : "jpg";
      const path = `${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("manifests")
        .upload(path, buf, { contentType: type });
      if (!upErr) imagePath = path;
    }

    if (!stops.length) {
      return NextResponse.json({ error: "No stops found in that file" }, { status: 422 });
    }

    const { data: scan } = await supabase
      .from("manifest_scans")
      .insert({
        image_path: imagePath,
        source,
        stops,
        stop_count: stops.length,
        created_by: user.id,
      })
      .select("id")
      .single();

    return NextResponse.json({ stops, scanId: scan?.id ?? null, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read manifest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
