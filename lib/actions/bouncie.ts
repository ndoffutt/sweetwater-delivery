"use server";

import { requireSession } from "@/lib/session";

const TOKEN_URL = "https://auth.bouncie.com/oauth/token";
const API_BASE = "https://api.bouncie.dev/v1";

export interface BouncieTestResult {
  ok: boolean;
  message: string;
  vehicles?: { nickName: string | null; hasLocation: boolean; address: string | null; lastUpdated: string | null }[];
}

/**
 * Test a Bouncie authorization code end-to-end without storing it anywhere.
 * The code is supplied by the signed-in owner, used for this one exchange, and
 * never logged or persisted — so a fresh code can be validated instantly
 * instead of going through an env-var edit and redeploy each attempt.
 */
export async function testBouncieCode(code: string): Promise<BouncieTestResult> {
  const session = await requireSession();
  if (session.role !== "admin") return { ok: false, message: "Owner only." };

  const clean = (code || "").trim();
  if (!clean) return { ok: false, message: "Paste a code first." };
  if (/https?:\/\//.test(clean))
    return { ok: false, message: "That looks like a URL. Paste only the part after code= in the address bar." };

  const id = (process.env.BOUNCIE_CLIENT_ID || "").trim();
  const secret = (process.env.BOUNCIE_CLIENT_SECRET || "").trim();
  const redirect = (process.env.BOUNCIE_REDIRECT_URI || "").trim();
  if (!id || !secret) return { ok: false, message: "BOUNCIE_CLIENT_ID / BOUNCIE_CLIENT_SECRET aren't set on this environment." };

  try {
    const form = new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "authorization_code",
      code: clean,
    });
    if (redirect) form.set("redirect_uri", redirect);

    const tRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      cache: "no-store",
    });
    const tText = await tRes.text();
    let token: string | null = null;
    try { token = (JSON.parse(tText) as { access_token?: string }).access_token ?? null; } catch { /* not json */ }

    if (!token) {
      const desc = (() => {
        try { return (JSON.parse(tText) as { error_description?: string }).error_description; } catch { return undefined; }
      })();
      return {
        ok: false,
        message: `Bouncie rejected it (${tRes.status})${desc ? `: ${desc}` : ""}. If it says the code is invalid, generate a brand-new one and paste it right away.`,
      };
    }

    const vRes = await fetch(`${API_BASE}/vehicles`, { headers: { Authorization: token }, cache: "no-store" });
    if (!vRes.ok) return { ok: true, message: `Code works, but the vehicles call returned ${vRes.status}.` };

    const list = (await vRes.json()) as {
      nickName?: string | null;
      stats?: { lastUpdated?: string; location?: { lat?: number; lon?: number; address?: string } };
    }[];

    return {
      ok: true,
      message:
        list.length === 0
          ? "Code works, but no vehicles are shared with this app yet."
          : `Code works — ${list.length} vehicle${list.length === 1 ? "" : "s"} found. Save it as BOUNCIE_CODE.`,
      vehicles: list.map((v) => ({
        nickName: v.nickName ?? null,
        hasLocation: v.stats?.location?.lat != null && v.stats?.location?.lon != null,
        address: v.stats?.location?.address ?? null,
        lastUpdated: v.stats?.lastUpdated ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, message: `Couldn't reach Bouncie: ${e instanceof Error ? e.message : String(e)}` };
  }
}
