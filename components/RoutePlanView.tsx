"use client";

import { useState } from "react";
import Link from "next/link";
import RouteMap from "@/components/RouteMap";
import { formatMiles } from "@/lib/geo";
import type { RouteStop } from "@/lib/types";

export interface PlanStop { id: string; name: string; town: string; lat: number; lng: number }
export interface RunPlan {
  day: string;
  label: string;
  blurb: string;
  /** % of pairs backed by real Mapbox road data (rest fall back to straight line). */
  roadCoverage: number;
  currentMiles: number;
  bestMiles: number;
  stops: PlanStop[];
  /** Indices into stops, in the proposed visiting order. */
  order: number[];
}

// The map component wants RouteStop shaped data; only the fields it reads matter.
const toRouteStops = (stops: PlanStop[]): RouteStop[] =>
  stops.map((s, i) => ({
    id: s.id,
    stop_order: i + 1,
    status: "pending",
    customer: { name: s.name, address: s.town, lat: s.lat, lng: s.lng },
  })) as unknown as RouteStop[];

function Run({ plan }: { plan: RunPlan }) {
  const [showing, setShowing] = useState<"proposed" | "current">("proposed");
  const saved = plan.currentMiles - plan.bestMiles;
  const pct = plan.currentMiles > 0 ? Math.round((saved / plan.currentMiles) * 100) : 0;
  const proposed = plan.order.map((i) => plan.stops[i]);
  const shown = showing === "proposed" ? proposed : plan.stops;
  const moved = plan.order.filter((orig, i) => orig !== i).length;

  return (
    <div className="bg-cream rounded-2xl border border-cream-dark overflow-hidden mb-6">
      <div className="p-4 sm:p-5 border-b border-cream-dark">
        <h3 className="font-serif text-xl font-light text-charcoal">{plan.label}</h3>
        <p className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-0.5">{plan.blurb}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-4">
          <div className="text-center">
            <div className="font-serif text-2xl font-light text-charcoal">{plan.stops.length}</div>
            <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-0.5">Stops</div>
          </div>
          <div className="text-center">
            <div className="font-serif text-2xl font-light text-red-600">{formatMiles(plan.currentMiles)}</div>
            <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-0.5">Today</div>
          </div>
          <div className="text-center">
            <div className="font-serif text-2xl font-light text-green-primary">{formatMiles(plan.bestMiles)}</div>
            <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-0.5">Proposed</div>
          </div>
          <div className="text-center">
            <div className="font-serif text-2xl font-light text-green-primary">−{formatMiles(saved)}</div>
            <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-0.5">Saved · {pct}%</div>
          </div>
        </div>
      </div>

      {/* Toggle between the two orders on one map — easier to compare than
          two small maps side by side on a phone. */}
      <div className="flex gap-1.5 p-3 border-b border-cream-dark">
        {(["proposed", "current"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setShowing(k)}
            className={`flex-1 min-h-tap py-2 rounded-lg text-[11px] font-body uppercase tracking-widest border ${
              showing === k
                ? k === "proposed"
                  ? "bg-green-primary border-green-primary text-cream"
                  : "bg-red-600 border-red-600 text-cream"
                : "bg-cream border-cream-dark text-charcoal/50"
            }`}
          >
            {k === "proposed" ? "Proposed" : "Today's order"}
          </button>
        ))}
      </div>

      <div className="relative h-[52vh] min-h-[300px]">
        <RouteMap stops={toRouteStops(shown)} targetId="" onSelect={() => {}} />
      </div>

      <div className="p-4">
        <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-2">
          {showing === "proposed" ? `Proposed order · ${moved} of ${plan.stops.length} move` : "Today's order"}
        </p>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-cream-dark divide-y divide-cream-dark">
          {shown.map((s, i) => {
            const from = showing === "proposed" ? plan.order[i] : i;
            const movedHere = showing === "proposed" && from !== i;
            return (
              <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0 w-6 h-6 rounded-full bg-cream-dark text-charcoal/60 text-[11px] font-body flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-[13px] text-charcoal truncate">{s.name}</div>
                  <div className="text-[11px] text-charcoal/40 font-body">{s.town}</div>
                </div>
                {movedHere && (
                  <span className="shrink-0 text-[11px] font-body text-gold-dark">was #{from + 1}</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-charcoal/35 font-body mt-2.5 leading-relaxed">
          Distances are real driving miles from Mapbox
          {plan.roadCoverage < 100 && ` (${plan.roadCoverage}% of pairs — the rest fall back to a straight-line estimate)`}
          . The map line shows visiting order, not the exact roads driven.
        </p>
      </div>
    </div>
  );
}

export default function RoutePlanView({ plans }: { plans: RunPlan[] }) {
  const weekly = plans.reduce((n, p) => n + (p.currentMiles - p.bestMiles), 0);

  return (
    <div className="p-5 md:p-8 md:max-w-3xl md:mx-auto">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
        ← Dispatch
      </Link>
      <h2 className="font-serif text-2xl font-light text-charcoal mb-1">Route plan</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-5">
        Today&apos;s order vs the best order
      </p>

      {plans.length === 0 ? (
        <div className="bg-cream rounded-xl border border-cream-dark p-10 text-center text-charcoal/45 font-body">
          Not enough customers with locations to plan a run yet.
        </div>
      ) : (
        <>
          <div className="bg-green-primary/[0.07] border border-green-primary/25 rounded-xl p-4 mb-6">
            <p className="font-body text-sm text-charcoal">
              Reordering both runs would save{" "}
              <b className="text-green-primary">{formatMiles(weekly)} a week</b>
              {" "}— about {Math.round(weekly * 52)} miles a year.
            </p>
            <p className="text-[11px] text-charcoal/45 font-body mt-1">
              Nothing has changed yet. This is a preview.
            </p>
          </div>
          {plans.map((p) => <Run key={p.day} plan={p} />)}
        </>
      )}
    </div>
  );
}
