"use client";

import { useState, useTransition } from "react";
import { addProspectVisit, removeProspectVisit } from "@/lib/actions/prospectVisits";

export interface NearbyItem { id: string; name: string; town: string | null; miles: number }

// Overdue prospects sitting near today's route. The manager adds the ones he'll
// swing by; they become planned visits on the route (logged in the field).
export default function NearbyVisits({
  routeId,
  items,
  initialAdded,
}: {
  routeId: string;
  items: NearbyItem[];
  initialAdded: string[];
}) {
  const [added, setAdded] = useState<string[]>(initialAdded);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, start] = useTransition();
  const [error, setError] = useState("");

  if (items.length === 0) return null;

  function toggle(id: string) {
    const isAdded = added.includes(id);
    setBusyId(id);
    setError("");
    // optimistic
    setAdded((a) => (isAdded ? a.filter((x) => x !== id) : [...a, id]));
    start(async () => {
      const res = isAdded
        ? await removeProspectVisit(routeId, id)
        : await addProspectVisit(routeId, id);
      if (res.error) {
        setError(res.error);
        setAdded((a) => (isAdded ? [...a, id] : a.filter((x) => x !== id))); // revert
      }
      setBusyId(null);
    });
  }

  return (
    <div className="mt-4 bg-cream rounded-2xl border border-gold-primary/40 p-4 md:p-5">
      <p className="font-body text-[11px] uppercase tracking-widest text-gold-dark mb-1">Overdue prospects near this route</p>
      <p className="font-body text-xs text-charcoal/50 mb-3">Add the ones you&apos;ll swing by — you&apos;ll log the visit when you get there.</p>
      <div className="divide-y divide-cream-dark">
        {items.map((p) => {
          const on = added.includes(p.id);
          return (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="shrink-0">🔔</span>
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm text-charcoal truncate">{p.name}</p>
                <p className="text-xs text-charcoal/45 font-body truncate">
                  {p.town ? `${p.town} · ` : ""}{p.miles.toFixed(1)} mi from route
                </p>
              </div>
              <button
                onClick={() => toggle(p.id)}
                disabled={busyId === p.id}
                className={`shrink-0 min-h-tap px-3 py-1.5 rounded-lg text-xs font-body uppercase tracking-widest disabled:opacity-60 ${on ? "bg-green-primary text-cream" : "border border-cream-dark text-green-primary"}`}
              >
                {on ? "✓ On route" : "+ Add"}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600 font-body mt-2">{error}</p>}
    </div>
  );
}
