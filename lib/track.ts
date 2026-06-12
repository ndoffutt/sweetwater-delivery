// Tokenized public tracking links ("you're 3 stops away"), Domino's-style.
// The token is the stop id plus a short HMAC, so links can't be guessed or
// enumerated and need no extra table or column.

import { createHmac } from "crypto";

const SECRET = process.env.SUPABASE_SECRET_KEY || "dev-fallback-secret";

const sign = (stopId: string) =>
  createHmac("sha256", SECRET).update(`track:${stopId}`).digest("hex").slice(0, 16);

export function trackToken(stopId: string): string {
  return `${stopId}.${sign(stopId)}`;
}

export function verifyTrackToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const stopId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(stopId) || sig.length !== 16) return null;
  return sign(stopId) === sig ? stopId : null;
}

export function trackUrl(stopId: string): string {
  const base = process.env.APP_URL ?? "https://sweetwater-delivery.vercel.app";
  return `${base}/track/${trackToken(stopId)}`;
}
