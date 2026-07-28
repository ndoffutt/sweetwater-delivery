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

  // Shape-check the stored values WITHOUT revealing them. These three checks
  // catch the usual causes: the authorize URL pasted instead of the code, a
  // trailing newline from a copy/paste, or a whole "code=…" fragment.
  const shape = (v: string | undefined) =>
    !v
      ? null
      : {
          length: v.length,
          looksLikeUrl: /https?:\/\/|:\/\//.test(v),
          containsEquals: v.includes("="),
          containsQuestion: v.includes("?"),
          hasOuterWhitespace: v !== v.trim(),
          allUrlSafeChars: /^[A-Za-z0-9._~-]+$/.test(v.trim()),
        };

  const out: Record<string, unknown> = {
    configured: Boolean(
      process.env.BOUNCIE_CLIENT_ID && process.env.BOUNCIE_CLIENT_SECRET && process.env.BOUNCIE_CODE
    ),
    clientIdShape: shape(process.env.BOUNCIE_CLIENT_ID),
    secretShape: shape(process.env.BOUNCIE_CLIENT_SECRET),
    codeShape: shape(process.env.BOUNCIE_CODE),
    redirectUri: process.env.BOUNCIE_REDIRECT_URI ?? null,
    // Equality checks reveal nothing about the values themselves but catch the
    // classic mix-up of pasting the same string into two fields.
    codeEqualsSecret:
      Boolean(process.env.BOUNCIE_CODE) &&
      (process.env.BOUNCIE_CODE || "").trim() === (process.env.BOUNCIE_CLIENT_SECRET || "").trim(),
    codeEqualsClientId:
      Boolean(process.env.BOUNCIE_CODE) &&
      (process.env.BOUNCIE_CODE || "").trim() === (process.env.BOUNCIE_CLIENT_ID || "").trim(),
  };

  try {
    const id = (process.env.BOUNCIE_CLIENT_ID || "").trim();
    const secret = (process.env.BOUNCIE_CLIENT_SECRET || "").trim();
    const code = (process.env.BOUNCIE_CODE || "").trim();
    const redirect = (process.env.BOUNCIE_REDIRECT_URI || "").trim();

    // Try every plausible encoding of the grant so a format problem can be told
    // apart from a genuinely bad code. Whichever returns a token wins.
    const base: Record<string, string> = {
      client_id: id,
      client_secret: secret,
      grant_type: "authorization_code",
      code,
    };
    const variants: { name: string; json: boolean; withRedirect: boolean }[] = [
      { name: "form+redirect", json: false, withRedirect: true },
      { name: "form", json: false, withRedirect: false },
      { name: "json+redirect", json: true, withRedirect: true },
      { name: "json", json: true, withRedirect: false },
    ];

    const attempts: Record<string, unknown>[] = [];
    let accessToken: string | null = null;

    for (const v of variants) {
      const payload = { ...base, ...(v.withRedirect && redirect ? { redirect_uri: redirect } : {}) };
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": v.json ? "application/json" : "application/x-www-form-urlencoded" },
        body: v.json ? JSON.stringify(payload) : new URLSearchParams(payload).toString(),
        cache: "no-store",
      });
      const text = await res.text();
      let tok: string | null = null;
      try { tok = (JSON.parse(text) as { access_token?: string }).access_token ?? null; } catch { /* not json */ }
      attempts.push({ variant: v.name, status: res.status, gotToken: Boolean(tok), body: tok ? undefined : text.slice(0, 180) });
      if (tok) { accessToken = tok; out.workingVariant = v.name; break; }
    }
    out.attempts = attempts;
    out.gotAccessToken = Boolean(accessToken);

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
