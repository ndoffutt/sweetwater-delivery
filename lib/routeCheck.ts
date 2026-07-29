import { getRoadMatrix, milesBetween, coverage, shopPoint, type Point } from "@/lib/roadDistance";
import { optimizeWithCost } from "@/lib/optimize";

export interface RoadRouteCheck {
  /** Driving miles for the order as dispatched. */
  currentMiles: number;
  /** Driving miles for the best order found. */
  bestMiles: number;
  savedMiles: number;
  /** Percent of the current route that could have been avoided. */
  savedPct: number;
  /** How many stops would sit in a different position. */
  movedCount: number;
  /** Optimised visiting order, as indices into the supplied stops. */
  order: number[];
  /** % of pairs backed by real road data rather than a straight-line estimate. */
  roadCoverage: number;
  /** Nothing meaningful to gain. */
  alreadyGood: boolean;
}

export interface CheckableStop { id: string; lat: number | null; lng: number | null }

/**
 * Score a route's stop order against the best order, using real driving
 * distances. Used both before dispatch and afterwards, so a route that went out
 * badly ordered is visible rather than silently costing miles.
 *
 * Returns null when there aren't enough located stops to say anything useful.
 * `allowFetch=false` keeps it to whatever is already cached — worth using on
 * pages that shouldn't wait on Mapbox.
 */
export async function checkRouteRoad(
  stops: CheckableStop[],
  allowFetch = true
): Promise<RoadRouteCheck | null> {
  const located = stops.filter(
    (s): s is { id: string; lat: number; lng: number } => s.lat != null && s.lng != null
  );
  if (located.length < 3) return null;

  const points: Point[] = [shopPoint(), ...located.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))];
  const matrix = await getRoadMatrix(points, allowFetch);
  const cost = (a: number, b: number) => milesBetween(matrix, points[a], points[b]);

  const tourMiles = (order: number[]) => {
    if (order.length === 0) return 0;
    let m = cost(0, order[0] + 1);
    for (let i = 1; i < order.length; i++) m += cost(order[i - 1] + 1, order[i] + 1);
    return m + cost(order[order.length - 1] + 1, 0);
  };

  const currentOrder = located.map((_, i) => i);
  const bestOrder = optimizeWithCost(located.length, cost);
  const currentMiles = tourMiles(currentOrder);
  const bestMiles = tourMiles(bestOrder);
  const savedMiles = Math.max(0, currentMiles - bestMiles);

  return {
    currentMiles,
    bestMiles,
    savedMiles,
    savedPct: currentMiles > 0 ? Math.round((savedMiles / currentMiles) * 100) : 0,
    movedCount: bestOrder.reduce((n, orig, i) => n + (orig === i ? 0 : 1), 0),
    order: bestOrder,
    roadCoverage: Math.round(coverage(matrix, points) * 100),
    // Under half a mile isn't worth re-planning a day over.
    alreadyGood: savedMiles < 0.5,
  };
}
