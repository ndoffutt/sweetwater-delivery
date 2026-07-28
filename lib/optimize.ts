import { haversineMiles, type LatLng } from "@/lib/geo";

/**
 * Route order optimiser for the pre-dispatch check.
 *
 * Why this exists: a day's route is built from the master route sequence, which
 * is a good ordering of ALL customers. Take a subset of that list — whoever is
 * actually delivering today — and the relative order survives, but it can be a
 * long way from the best order for that particular subset. That's why route
 * quality "varies depending on who's on the list".
 *
 * Approach: nearest-neighbour for a decent starting tour, then 2-opt (repeatedly
 * un-cross any two edges that would be shorter reversed) until it stops
 * improving. For the 15-40 stops in a real day this reaches the optimal or
 * near-optimal order in milliseconds.
 *
 * Distances are straight-line × the same road factor used elsewhere in the app,
 * so this optimises the driving *pattern*, not exact turn-by-turn mileage.
 */

export interface Stoppable {
  lat: number | null;
  lng: number | null;
}

/** Total distance of shop → points → shop. */
function tourMiles(order: LatLng[], anchor: LatLng): number {
  if (order.length === 0) return 0;
  let m = haversineMiles(anchor, order[0]);
  for (let i = 1; i < order.length; i++) m += haversineMiles(order[i - 1], order[i]);
  return m + haversineMiles(order[order.length - 1], anchor);
}

/**
 * Best visiting order for `items`, starting and ending at `anchor` (the shop).
 * Returns indices into the original array. Items without coordinates can't be
 * placed geographically, so they keep their relative order and go last.
 */
export function optimizeOrder<T extends Stoppable>(items: T[], anchor: LatLng): number[] {
  const located: { idx: number; p: LatLng }[] = [];
  const unlocated: number[] = [];
  items.forEach((it, idx) => {
    if (it.lat != null && it.lng != null) located.push({ idx, p: { lat: it.lat, lng: it.lng } });
    else unlocated.push(idx);
  });
  if (located.length < 2) return [...located.map((l) => l.idx), ...unlocated];

  // ── Nearest neighbour from the shop ──
  const remaining = located.slice();
  const tour: { idx: number; p: LatLng }[] = [];
  let cursor = anchor;
  while (remaining.length) {
    let best = 0;
    let bestD = haversineMiles(cursor, remaining[0].p);
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineMiles(cursor, remaining[i].p);
      if (d < bestD) { bestD = d; best = i; }
    }
    cursor = remaining[best].p;
    tour.push(remaining.splice(best, 1)[0]);
  }

  // ── 2-opt: reverse any segment that shortens the loop ──
  // Bounded so a pathological input can never spin: real routes converge in a
  // handful of passes.
  const MAX_PASSES = 40;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let k = i + 1; k < tour.length; k++) {
        const a = i === 0 ? anchor : tour[i - 1].p;
        const b = tour[i].p;
        const c = tour[k].p;
        const d = k === tour.length - 1 ? anchor : tour[k + 1].p;
        // Current edges a→b and c→d vs reversed a→c and b→d.
        const delta =
          haversineMiles(a, c) + haversineMiles(b, d) - haversineMiles(a, b) - haversineMiles(c, d);
        if (delta < -1e-9) {
          const seg = tour.slice(i, k + 1).reverse();
          tour.splice(i, seg.length, ...seg);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  // A loop costs the same driven either way round (shop → stops → shop is
  // symmetric), so of the two equivalent directions prefer the one that stays
  // closer to the order the office already knows. Same mileage, far fewer stops
  // appearing to "move" — which keeps the suggestion easy to trust.
  const forward = tour.map((t) => t.idx);
  const backward = forward.slice().reverse();
  const churn = (order: number[]) =>
    order.reduce((sum, origIdx, newIdx) => sum + Math.abs(origIdx - newIdx), 0);
  const chosen = churn(backward) < churn(forward) ? backward : forward;

  return [...chosen, ...unlocated];
}

export interface RouteCheck {
  /** Miles for the order as it stands (shop → stops → shop). */
  currentMiles: number;
  /** Miles for the best order found. */
  bestMiles: number;
  /** Miles saved by reordering; 0 when already optimal. */
  savedMiles: number;
  /** Indices of the optimised order. */
  order: number[];
  /** True when the current order already matches the optimised one. */
  alreadyOptimal: boolean;
  /** How many stops would actually move position. */
  movedCount: number;
}

const ROAD_FACTOR = 1.3; // matches lib/geo's crow-flies → road estimate

/** Compare the current stop order against the optimised one. */
export function checkRoute<T extends Stoppable>(items: T[], anchor: LatLng): RouteCheck {
  const coordsOf = (list: T[]) =>
    list
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => ({ lat: i.lat as number, lng: i.lng as number }));

  const order = optimizeOrder(items, anchor);
  const currentMiles = tourMiles(coordsOf(items), anchor) * ROAD_FACTOR;
  const bestMiles = tourMiles(coordsOf(order.map((i) => items[i])), anchor) * ROAD_FACTOR;
  const movedCount = order.reduce((n, origIdx, newIdx) => n + (origIdx === newIdx ? 0 : 1), 0);
  const savedMiles = Math.max(0, currentMiles - bestMiles);

  return {
    currentMiles,
    bestMiles,
    savedMiles,
    order,
    // Treat sub-tenth-of-a-mile differences as noise, not a real win.
    alreadyOptimal: savedMiles < 0.1,
    movedCount,
  };
}
