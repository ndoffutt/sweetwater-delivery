// TEMPORARY probe — admin-only. Reports the real shape of Bouncie's /trips
// response so the trip-timing feature is built against actual data rather than
// guessed field names. Returns field names and one sanitised sample; never dumps
// full GPS paths and never returns the access token. Delete once the schema is
// captured.
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TOKEN_URL = "https://auth.bouncie.com/oauth/token";
const API_BASE = "https://api.bouncie.dev/v1";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {};
  try {
    const form = new URLSearchParams({
      client_id: (process.env.BOUNCIE_CLIENT_ID || "").trim(),
      client_secret: (process.env.BOUNCIE_CLIENT_SECRET || "").trim(),
      grant_type: "authorization_code",
      code: (process.env.BOUNCIE_CODE || "").trim(),
    });
    const redirect = (process.env.BOUNCIE_REDIRECT_URI || "").trim();
    if (redirect) form.set("redirect_uri", redirect);

    const tRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    const access = (JSON.parse(await tRes.text()) as { access_token?: string }).access_token;
    if (!access) return NextResponse.json({ error: "no token", status: tRes.status });

    // IMEI comes from /vehicles.
    const vRes = await fetch(`${API_BASE}/vehicles`, { headers: { Authorization: access }, cache: "no-store" });
    const vehicles = (await vRes.json()) as { imei?: string; nickName?: string; vin?: string }[];
    const imei = vehicles?.[0]?.imei;
    out.vehicleKeys = vehicles?.[0] ? Object.keys(vehicles[0]) : [];
    out.foundImei = Boolean(imei);

    if (!imei) return NextResponse.json(out);

    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const url = `${API_BASE}/trips?imei=${encodeURIComponent(imei)}&gps-format=polyline&starts-after=${encodeURIComponent(since)}`;
    const tripRes = await fetch(url, { headers: { Authorization: access }, cache: "no-store" });
    out.tripsStatus = tripRes.status;
    const text = await tripRes.text();

    let trips: unknown;
    try { trips = JSON.parse(text); } catch { out.tripsBody = text.slice(0, 300); return NextResponse.json(out); }

    if (!Array.isArray(trips)) {
      out.tripsNotArray = JSON.stringify(trips).slice(0, 400);
      return NextResponse.json(out);
    }

    out.tripCount = trips.length;
    const first = trips[0] as Record<string, unknown> | undefined;
    if (first) {
      out.tripKeys = Object.keys(first);
      // Sanitised sample: scalars only, so a long GPS path can't blow up the response.
      const sample: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(first)) {
        if (v === null || ["string", "number", "boolean"].includes(typeof v)) {
          sample[k] = typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}…(${v.length} chars)` : v;
        } else if (Array.isArray(v)) {
          sample[k] = `[array ${v.length}]${v[0] && typeof v[0] === "object" ? ` keys=${Object.keys(v[0] as object).join("|")}` : ""}`;
        } else if (typeof v === "object") {
          sample[k] = `{object keys=${Object.keys(v as object).join("|")}}`;
        }
      }
      out.sampleTrip = sample;
      out.lastTripSample = (() => {
        const last = trips[trips.length - 1] as Record<string, unknown>;
        return { start: last?.startTime ?? last?.start ?? null, end: last?.endTime ?? last?.end ?? null };
      })();
    }
  } catch (e) {
    out.threw = e instanceof Error ? e.message : String(e);
  }
  return NextResponse.json(out);
}
