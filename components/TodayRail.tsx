"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resolveException, type DeliveryException } from "@/lib/actions/exceptions";

export interface CheckinDue {
  id: string;
  name: string;
  town: string | null;
  priority: string;
  daysOverdue: number; // ≥0 = overdue by that many days, <0 = due soon
  callOnly: boolean;
  manual: boolean;
}

const fmtDate = (ymd: string) =>
  ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

/** "Needs attention" — deliveries that weren't done properly (skipped / no photo). */
export function NeedsAttention({ exceptions: initial }: { exceptions: DeliveryException[] }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  function resolve(stopId: string, kind: DeliveryException["kind"]) {
    // Optimistic remove; restore on error.
    const prev = items;
    setItems((xs) => xs.filter((x) => !(x.stopId === stopId && x.kind === kind)));
    start(async () => {
      const res = await resolveException(stopId, kind);
      if (res.error) { setError(res.error); setItems(prev); }
    });
  }

  return (
    <div className="bg-cream rounded-2xl border border-cream-dark overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-3.5 ${items.length ? "border-b border-cream-dark" : ""}`}>
        <span className={items.length ? "text-red-600" : "text-charcoal/35"}>⚠️</span>
        <span className={`font-body text-[11px] uppercase tracking-widest ${items.length ? "text-red-700" : "text-charcoal/45"}`}>
          Needs attention · {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 pb-4 pt-1 font-body text-[13px] text-charcoal/50">
          All clear — every recent delivery is accounted for.
        </p>
      ) : (
        items.map((ex, i) => (
          <div key={`${ex.stopId}-${ex.kind}`} className={`px-4 py-3 ${i ? "border-t border-cream-dark" : ""}`}>
            <div className="flex items-center gap-2">
              <span className="shrink-0">{ex.kind === "nophoto" ? "📷" : "⚠️"}</span>
              <span className="font-body text-[13px] font-semibold text-charcoal">
                {ex.kind === "nophoto" ? "No photo proof" : "Stop skipped"}
              </span>
              <span className="ml-auto font-body text-[11px] text-charcoal/40 shrink-0">{fmtDate(ex.date)}</span>
            </div>
            <p className="font-body text-[13px] text-charcoal/60 mt-1 leading-snug">
              <Link href={`/dispatch/delivery/${ex.stopId}`} className="font-semibold text-charcoal underline-offset-2 hover:underline">
                {ex.customerName}
              </Link>{" "}
              — {ex.detail}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => resolve(ex.stopId, ex.kind)}
                className="min-h-tap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cream-dark text-green-primary font-body text-xs font-semibold"
              >
                ✓ Resolve
              </button>
              <Link
                href={`/dispatch/delivery/${ex.stopId}`}
                className="min-h-tap inline-flex items-center px-3 py-1.5 rounded-lg text-charcoal/50 font-body text-xs"
              >
                View ›
              </Link>
            </div>
          </div>
        ))
      )}
      {error && <p className="px-4 pb-3 text-xs text-red-600 font-body">{error}</p>}
    </div>
  );
}

/** "Check-ins due" — prospects past their priority window (or manually flagged). */
export function CheckinsDue({ items }: { items: CheckinDue[] }) {
  return (
    <div className="bg-cream rounded-2xl border border-cream-dark overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-cream-dark">
        <span className="text-gold-dark">🔔</span>
        <span className="font-body text-[11px] uppercase tracking-widest text-charcoal/45">
          Check-ins due · {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 font-body text-[13px] text-charcoal/50">Nothing due — pipeline is warm.</p>
      ) : (
        items.map((c, i) => (
          <Link
            key={c.id}
            href={`/sales/prospects?id=${c.id}`}
            className={`flex items-center gap-3 px-4 py-2.5 hover:bg-cream-dark/30 transition-colors ${i ? "border-t border-cream-dark" : ""}`}
          >
            <span className="shrink-0">{c.callOnly ? "📞" : "🔔"}</span>
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm text-charcoal truncate">{c.name}</p>
              <p className="text-[11px] font-body text-charcoal/45 truncate">
                {c.town ? `${c.town} · ` : ""}
                {c.manual ? "requested" : c.daysOverdue > 0 ? `${c.daysOverdue}d overdue` : "due today"}
                {c.priority === "high" ? " · high" : ""}
              </p>
            </div>
            <span className="text-charcoal/30 shrink-0">›</span>
          </Link>
        ))
      )}
      <Link
        href="/sales/prospects"
        className="block text-center font-body text-xs font-semibold text-green-primary py-2.5 border-t border-cream-dark hover:bg-cream-dark/30"
      >
        All prospects ›
      </Link>
    </div>
  );
}
