// Lightweight distance/ETA estimates for the dispatch route preview.
// Straight-line (haversine) distances scaled up to approximate road miles - good
// enough for a "~14 mi · est. 3h 10m" summary, not for turn-by-turn.

export interface LatLng {
  lat: number;
  lng: number;
}

const ROAD_FACTOR = 1.3; // crow-flies -> road distance fudge
const AVG_MPH = 22; // Hamptons back-roads average
const STOP_MINUTES = 8; // dwell time per delivery stop

export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8; // earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total road-ish miles through the points in order. */
export function routeMiles(points: (LatLng | null | undefined)[]): number {
  const pts = points.filter((p): p is LatLng => !!p && p.lat != null && p.lng != null);
  let miles = 0;
  for (let i = 1; i < pts.length; i++) miles += haversineMiles(pts[i - 1], pts[i]);
  return miles * ROAD_FACTOR;
}

/** Rough end-to-end time (driving + per-stop dwell) for a route. */
export function routeEtaMinutes(points: (LatLng | null | undefined)[]): number {
  const valid = points.filter((p) => !!p && p.lat != null && p.lng != null).length;
  const miles = routeMiles(points);
  return (miles / AVG_MPH) * 60 + valid * STOP_MINUTES;
}

export function formatMiles(miles: number): string {
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Cheapest-insertion: where in an ordered path does `point` add the least driving
 * detour? Returns the index in 0..ordered.length to insert at. Endpoints cost a
 * single edge; internal gaps cost the detour (in - out - original).
 */
/**
 * The route_seq for a stop inserted between two master-route neighbors:
 * midpoint when both exist, just past the edge when only one does, 1 for an
 * empty route. (normalizeRouteSeqs later collapses fractions back to 1..N.)
 */
export function seqBetween(before?: number | null, after?: number | null): number {
  if (before != null && after != null) return (before + after) / 2;
  if (before != null) return before + 0.5;
  if (after != null) return after - 0.5;
  return 1;
}

export function cheapestInsertion(ordered: LatLng[], point: LatLng): number {
  const n = ordered.length;
  if (n === 0) return 0;
  if (n === 1) return haversineMiles(point, ordered[0]) >= 0 ? 1 : 0;

  let bestIdx = 0;
  let bestCost = haversineMiles(point, ordered[0]); // before first

  for (let i = 0; i < n - 1; i++) {
    const detour =
      haversineMiles(ordered[i], point) +
      haversineMiles(point, ordered[i + 1]) -
      haversineMiles(ordered[i], ordered[i + 1]);
    if (detour < bestCost) {
      bestCost = detour;
      bestIdx = i + 1;
    }
  }

  const endCost = haversineMiles(ordered[n - 1], point); // after last
  if (endCost < bestCost) bestIdx = n;

  return bestIdx;
}
