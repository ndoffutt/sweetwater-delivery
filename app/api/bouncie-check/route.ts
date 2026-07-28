// TEMPORARY diagnostic — admin-only. Reports which stage of the Bouncie call
// fails (token exchange vs vehicles fetch) WITHOUT leaking any secret or token.
// Delete once the van GPS is confirmed working.
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

  const out: Record<string, unknown> = {
    configured: Boolean(
      process.env.BOUNCIE_CLIENT_ID && process.env.BOUNCIE_CLIENT_SECRET && process.env.BOUNCIE_CODE
    ),
    hasClientId: Boolean(process.env.BOUNCIE_CLIENT_ID),
    hasSecret: Boolean(process.env.BOUNCIE_CLIENT_SECRET),
    hasCode: Boolean(process.env.BOUNCIE_CODE),
    redirectUri: process.env.BOUNCIE_REDIRECT_URI ?? null,
  };

  try {
    const form = new URLSearchParams({
      client_id: process.env.BOUNCIE_CLIENT_ID || "",
      client_secret: process.env.BOUNCIE_CLIENT_SECRET || "",
      grant_type: "authorization_code",
      code: process.env.BOUNCIE_CODE || "",
    });
    if (process.env.BOUNCIE_REDIRECT_URI) form.set("redirect_uri", process.env.BOUNCIE_REDIRECT_URI);
    const tRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    out.tokenStatus = tRes.status;
    const tText = await tRes.text();
    // Report the error body (Bouncie returns a plain message, no secrets) but
    // never the access_token on success.
    let accessToken: string | null = null;
    try {
      const tJson = JSON.parse(tText);
      accessToken = tJson.access_token ?? null;
      out.gotAccessToken = Boolean(accessToken);
      if (!accessToken) out.tokenBody = tText.slice(0, 300);
    } catch {
      out.tokenBody = tText.slice(0, 300);
    }

    if (accessToken) {
      const vRes = await fetch(`${API_BASE}/vehicles`, {
        headers: { Authorization: accessToken },
        cache: "no-store",
      });
      out.vehiclesStatus = vRes.status;
      const vText = await vRes.text();
      try {
        const vJson = JSON.parse(vText);
        if (Array.isArray(vJson)) {
          out.vehicleCount = vJson.length;
          out.firstVehicleKeys = vJson[0] ? Object.keys(vJson[0]) : [];
          out.firstStatsKeys = vJson[0]?.stats ? Object.keys(vJson[0].stats) : [];
          out.firstLocation = vJson[0]?.stats?.location ?? null;
        } else {
          out.vehiclesBody = vText.slice(0, 300);
        }
      } catch {
        out.vehiclesBody = vText.slice(0, 300);
      }
    }
  } catch (e) {
    out.threw = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
