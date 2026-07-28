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
    // OAuth token endpoints take application/x-www-form-urlencoded, not JSON.
    // Values are trimmed — a trailing newline pasted into an env var silently
    // invalidates the grant.
    const form = new URLSearchParams({
      client_id: (process.env.BOUNCIE_CLIENT_ID || "").trim(),
      client_secret: (process.env.BOUNCIE_CLIENT_SECRET || "").trim(),
      grant_type: "authorization_code",
      code: (process.env.BOUNCIE_CODE || "").trim(),
    });
    const redirect = (process.env.BOUNCIE_REDIRECT_URI || "").trim();
    if (redirect) form.set("redirect_uri", redirect);
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
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

export interface BouncieTrip {
  transactionId: string;
  imei: string;
  startTime: string;
  endTime: string;
  distance?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  totalIdleDuration?: number;
  hardBrakingCount?: number;
  hardAccelerationCount?: number;
  startOdometer?: number;
  endOdometer?: number;
  fuelConsumed?: number;
  timeZone?: string;
  gps?: string;
}

/** IMEI of the van (first vehicle, or BOUNCIE_IMEI when set). */
export async function getVanImei(): Promise<string | null> {
  if (!bouncieConfigured()) return null;
  const want = (process.env.BOUNCIE_IMEI || "").trim();
  if (want) return want;
  try {
    const token = await getAccessToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/vehicles`, { headers: { Authorization: token }, cache: "no-store" });
    if (!res.ok) return null;
    const vehicles = (await res.json()) as BouncieVehicle[];
    return vehicles?.find((v) => v.imei)?.imei ?? null;
  } catch {
    return null;
  }
}

// Bouncie rejects any window wider than a week ("Start and End dates must be
// within a week of each other"), so requests are chunked into 6-day slices.
const WINDOW_MS = 6 * 24 * 3600 * 1000;

/**
 * Trips between two instants, walking the range in week-safe chunks.
 * Best-effort: a failed chunk is skipped rather than losing the whole sync.
 */
export async function getTrips(from: Date, to: Date): Promise<BouncieTrip[]> {
  if (!bouncieConfigured()) return [];
  const token = await getAccessToken();
  const imei = await getVanImei();
  if (!token || !imei) return [];

  const out: BouncieTrip[] = [];
  for (let start = from.getTime(); start < to.getTime(); start += WINDOW_MS) {
    const end = Math.min(start + WINDOW_MS, to.getTime());
    const url =
      `${API_BASE}/trips?imei=${encodeURIComponent(imei)}&gps-format=polyline` +
      `&starts-after=${encodeURIComponent(new Date(start).toISOString())}` +
      `&ends-before=${encodeURIComponent(new Date(end).toISOString())}`;
    try {
      const res = await fetch(url, { headers: { Authorization: token }, cache: "no-store" });
      if (!res.ok) continue;
      const chunk = (await res.json()) as BouncieTrip[];
      if (Array.isArray(chunk)) out.push(...chunk);
    } catch {
      // skip this window; the next sync will pick it up
    }
  }
  // De-duplicate across overlapping window edges.
  const seen = new Map<string, BouncieTrip>();
  for (const t of out) if (t?.transactionId) seen.set(t.transactionId, t);
  return Array.from(seen.values());
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
