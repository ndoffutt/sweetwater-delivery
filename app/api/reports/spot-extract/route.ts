import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { extractSpotSummary, deriveRevenue } from "@/lib/spotExtract";

export const maxDuration = 120;

// Owner-only: reads a SPOT "Outgoing Summary" screenshot/PDF and returns the
// revenue numbers pre-split for the weekly update form.
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("export");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No export file provided" }, { status: 400 });
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const mediaType = isPdf ? "application/pdf" : file.type || "image/jpeg";

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const summary = await extractSpotSummary(buf.toString("base64"), mediaType);
    const revenue = deriveRevenue(summary);
    return NextResponse.json({ summary, revenue });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read the export";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
