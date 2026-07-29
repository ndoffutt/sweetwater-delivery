import { createAdminClient } from "@/lib/supabase/admin";
import { haversineMiles, SHOP, type LatLng } from "@/lib/geo";

/**
 * Real driving distances between route points, cached in road_distances.
 *
 * Why not straight lines: measured against the real road network, a
 * crow-flies-optimised Thursday run captured only ~22% of the available saving —
 * the Hamptons road network (water, peninsulas, few crossings) simply doesn't
 * match crow-flies geometry. Distances here come from Mapbox's Matrix API.
 *
 * Why cached: a 50-stop run needs ~26 matrix requests and several seconds, which
 * is unusable interactively. Customer coordinates rarely change, so pairs are
 * fetched once and reused. Anything still missing falls back to haversine × 1.3
 * so a cold cache degrades to the old estimate rather than breaking.
 */

export const SHOP_ID = "shop";
const ROAD_FACTOR = 1.3;
const MAPBOX_MAX_COORDS = 25; // driving profile limit per matrix request

export interface Point extends LatLng {
  id: string;
}

export type Matrix = Map<string, number>;
const key = (a: string, b: string) => `${a}>${b}`;

/** Cached miles for a pair, else the straight-line estimate. */
export function milesBetween(m: Matrix, a: Point, b: Point): number {
  const hit = m.get(key(a.id, b.id));
  if (hit != null) return hit;
  return haversineMiles(a, b) * ROAD_FACTOR;
}

/** How much of the matrix is real road data (0-1). */
export function coverage(m: Matrix, points: Point[]): number {
  let have = 0, want = 0;
  for (const a of points) for (const b of points) {
    if (a.id === b.id) continue;
    want++;
    if (m.has(key(a.id, b.id))) have++;
  }
  return want === 0 ? 1 : have / want;
}

async function loadCache(ids: string[]): Promise<Matrix> {
  const m: Matrix = new Map();
  try {
    const supabase = createAdminClient();
    // Chunked so a long id list can't blow the URL length.
    for (let i = 0; i < ids.length; i += 60) {
      const slice = ids.slice(i, i + 60);
      const { data, error } = await supabase
        .from("road_distances")
        .select("from_id,to_id,miles")
        .in("from_id", slice);
      if (error) return m; // table missing → empty cache, haversine fallback
      for (const r of (data ?? []) as { from_id: string; to_id: string; miles: number }[]) {
        m.set(key(r.from_id, r.to_id), Number(r.miles));
      }
    }
  } catch { /* fall through to empty */ }
  return m;
}

/**
 * Fill any missing pairs from Mapbox and persist them. Best-effort: on any
 * failure the existing (possibly partial) matrix is returned and callers fall
 * back to the straight-line estimate for whatever is still missing.
 */
async function fillMissing(points: Point[], m: Matrix): Promise<Matrix> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;
  if (!token) return m;

  const missing = points.some((a) => points.some((b) => a.id !== b.id && !m.has(key(a.id, b.id))));
  if (!missing) return m;

  const N = points.length;
  const B = Math.floor(MAPBOX_MAX_COORDS / 2); // two blocks per request
  const nBlocks = Math.ceil(N / B);
  const size = Math.ceil(N / nBlocks); // even split — a 1-point block is rejected by Mapbox
  const blocks: number[][] = [];
  for (let i = 0; i < N; i += size) {
    blocks.push(Array.from({ length: Math.min(size, N - i) }, (_, x) => x + i));
  }

  const rows: { from_id: string; to_id: string; miles: number }[] = [];
  for (const bi of blocks) {
    for (const bj of blocks) {
      const idx = [...bi, ...bj];
      const coords = idx.map((i) => `${points[i].lng},${points[i].lat}`).join(";");
      const sources = bi.map((_, n) => n).join(";");
      const destinations = bj.map((_, n) => n + bi.length).join(";");
      const url =
        `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}` +
        `?annotations=distance&sources=${sources}&destinations=${destinations}&access_token=${token}`;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const body = (await res.json()) as { distances?: (number | null)[][] };
        if (!body.distances) continue;
        bi.forEach((gi, a) =>
          bj.forEach((gj, b) => {
            const meters = body.distances![a]?.[b];
            if (meters == null) return;
            const miles = meters / 1609.34;
            m.set(key(points[gi].id, points[gj].id), miles);
            if (points[gi].id !== points[gj].id) {
              rows.push({ from_id: points[gi].id, to_id: points[gj].id, miles });
            }
          })
        );
      } catch { /* skip this block; next refresh can fill it */ }
    }
  }

  if (rows.length) {
    try {
      const supabase = createAdminClient();
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from("road_distances").upsert(rows.slice(i, i + 500), { onConflict: "from_id,to_id" });
      }
    } catch { /* cache write is best-effort */ }
  }
  return m;
}

/** Road-distance matrix for these points, using the cache and topping it up. */
export async function getRoadMatrix(points: Point[], allowFetch = true): Promise<Matrix> {
  const m = await loadCache(points.map((p) => p.id));
  if (!allowFetch) return m;
  return fillMissing(points, m);
}

export const shopPoint = (): Point => ({ id: SHOP_ID, lat: SHOP.lat, lng: SHOP.lng });
