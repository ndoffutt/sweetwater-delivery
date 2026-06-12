import type { SessionUser } from "./types";

const PIN_SALT = "sw-delivery-2026";
const COOKIE_NAME = "sw-session";
// Long-lived session: the one-person crew stays signed in on their own phone.
// The cookie is also re-issued on every visit (sliding refresh in middleware),
// so it effectively never expires while the app is in use.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export { COOKIE_NAME, COOKIE_MAX_AGE };

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + PIN_SALT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SECRET_KEY || "dev-fallback-secret";
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + COOKIE_MAX_AGE * 1000,
  });
  const encoder = new TextEncoder();
  const key = await getSigningKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return btoa(payload) + "." + sigHex;
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const [dataB64, sigHex] = token.split(".");
    if (!dataB64 || !sigHex) return null;

    const data = atob(dataB64);
    const encoder = new TextEncoder();
    const key = await getSigningKey();
    const sig = new Uint8Array(
      sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sig,
      encoder.encode(data)
    );
    if (!valid) return null;

    const parsed = JSON.parse(data);
    if (parsed.exp < Date.now()) return null;

    return { id: parsed.id, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}
