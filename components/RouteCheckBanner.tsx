import { formatMiles } from "@/lib/geo";
import type { RoadRouteCheck } from "@/lib/routeCheck";

/**
 * Verdict on how well a route was ordered, measured in real driving miles.
 * Shown on dispatched routes so a badly ordered day is visible rather than
 * quietly costing miles — and on the record afterwards, so the pattern is
 * obvious over time.
 */
export default function RouteCheckBanner({
  check,
  dispatched = false,
}: {
  check: RoadRouteCheck | null;
  dispatched?: boolean;
}) {
  if (!check) return null;

  // Below this, most pairs are straight-line guesses rather than real driving
  // distances — and straight-line has been measured capturing as little as 22%
  // of the real saving here. Say so plainly instead of quoting confident miles
  // off numbers that can't support them.
  const ROAD_CONFIDENCE = 80;
  const thin = check.roadCoverage < ROAD_CONFIDENCE;

  if (thin) {
    if (check.alreadyGood) return null; // nothing worth saying on weak data
    return (
      <div className="flex items-start gap-3 bg-cream border border-cream-dark rounded-xl px-4 py-3">
        <span className="shrink-0 text-base leading-none">🧭</span>
        <div className="min-w-0">
          <p className="font-body text-[12.5px] text-charcoal/70">
            This route&apos;s order looks like it could be tightened.
          </p>
          <p className="font-body text-[11px] text-charcoal/45 mt-0.5">
            Rough estimate only — real driving distances aren&apos;t available for these
            stops yet, so no mileage figure is shown.
          </p>
        </div>
      </div>
    );
  }

  if (check.alreadyGood) {
    return (
      <div className="flex items-center gap-3 bg-green-primary/[0.07] border border-green-primary/25 rounded-xl px-4 py-3">
        <span className="shrink-0 text-base leading-none">✓</span>
        <p className="font-body text-[12.5px] text-green-primary">
          Well ordered — {formatMiles(check.currentMiles)} of driving, about as short as it gets.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 bg-gold-primary/[0.10] border border-gold-primary/35 rounded-xl px-4 py-3">
      <span className="shrink-0 text-base leading-none">🧭</span>
      <div className="min-w-0">
        <p className="font-body text-[12.5px] text-charcoal">
          {dispatched ? "This route drove" : "This route is"}{" "}
          <b>{formatMiles(check.savedMiles)}</b> further than needed
          {" "}— {formatMiles(check.currentMiles)} vs {formatMiles(check.bestMiles)} ({check.savedPct}%).
        </p>
        <p className="font-body text-[11px] text-charcoal/45 mt-0.5">
          {check.movedCount} stop{check.movedCount === 1 ? "" : "s"} in a different order would do it
          {dispatched && " · for next time"}
        </p>
      </div>
    </div>
  );
}
