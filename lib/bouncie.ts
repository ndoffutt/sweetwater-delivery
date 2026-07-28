// Bouncie van GPS integration (https://docs.bouncie.dev).
//
// The Bouncie OBD device on the van reports real vehicle position — more
// reliable than a driver's phone (which may deny location, sleep, or die). This
// feeds the office "Live" dispatch map.
//
// Feature-flagged like SMS: with no BOUNCIE_* env vars the whole thing is a
// no-op (getVanLocation → null), so nothing breaks before the credentials are
// set up. Every call is best-effort and swallows errors — a Bouncie outage must
// never take down /api/live.
//
// Auth model: Bouncie uses an OAuth "authorization_code" grant that is reusable
// server-to-server. We exchange it for a ~1h access token and cache that in
// memory, re-exchanging when it expires.

const TOKEN_URL = "https://auth.bouncie.com/oauth/token";
const API_BASE = "https://api.bouncie.dev/v1";

export interface VanLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  address: string | null;
  lastUpdated: string | null;
  nickName: string | null;
}

export function bouncieConfigured(): boolean {
  return Boolean(
    process.env.BOUNCIE_CLIENT_ID &&
      process.env.BOUNCIE_CLIENT_SECRET &&
      process.env.BOUNCIE_CODE
  );
}

// In-memory access-token cache (per server instance). Bouncie tokens last ~1h;
// refresh a minute early to avoid edge-of-expiry 401s.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.BOUNCIE_CLIENT_ID,
        client_secret: process.env.BOUNCIE_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: process.env.BOUNCIE_CODE,
        redirect_uri: process.env.BOUNCIE_REDIRECT_URI || undefined,
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const ttlMs = (data.expires_in ?? 3600) * 1000;
    cachedToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - 60_000 };
    return cachedToken.value;
  } catch {
    return null;
  }
}

interface BouncieVehicle {
  nickName?: string | null;
  imei?: string;
  stats?: {
    lastUpdated?: string;
    speed?: number;
    location?: { lat?: number; lon?: number; heading?: number; address?: string };
  };
}

// Live position of the van. Returns null when unconfigured or on any failure.
// If BOUNCIE_IMEI is set, that specific vehicle is picked; otherwise the first
// vehicle with a valid location is used (fine for a single-van fleet).
export async function getVanLocation(): Promise<VanLocation | null> {
  if (!bouncieConfigured()) return null;
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/vehicles`, {
      headers: { Authorization: token },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const vehicles = (await res.json()) as BouncieVehicle[];
    if (!Array.isArray(vehicles) || vehicles.length === 0) return null;

    const wantImei = process.env.BOUNCIE_IMEI;
    const pick =
      (wantImei && vehicles.find((v) => v.imei === wantImei)) ||
      vehicles.find((v) => v.stats?.location?.lat != null && v.stats?.location?.lon != null) ||
      null;

    const loc = pick?.stats?.location;
    if (!pick || loc?.lat == null || loc?.lon == null) return null;

    return {
      lat: loc.lat,
      lng: loc.lon,
      heading: loc.heading ?? null,
      speed: pick.stats?.speed ?? null,
      address: loc.address ?? null,
      lastUpdated: pick.stats?.lastUpdated ?? null,
      nickName: pick.nickName ?? null,
    };
  } catch {
    return null;
  }
}
