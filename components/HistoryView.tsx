"use client";

import { useState } from "react";
import Link from "next/link";
import DriverPathMap from "@/components/DriverPathMap";

export interface HistoryStop {
  id: string;
  kind: "delivery" | "prospect";
  prospectId?: string | null;
  order: number;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: string;
  arrivedAt: string | null;
  completedAt: string | null;
  dropoff: boolean;
  pickup: boolean;
  notes: string | null;
  pieces: number;
  photos: string[];
}
export interface HistoryRoute {
  id: string;
  date: string;
  completedAt: string | null;
  stops: HistoryStop[];
  path: { lng: number; lat: number }[];
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "·";

// Minutes between two timestamps, or null if either is missing / nonsensical.
function mins(aIso: string | null, bIso: string | null): number | null {
  if (!aIso || !bIso) return null;
  const m = Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
  return m >= 0 ? m : null;
}
const dur = (m: number | null) => (m == null ? null : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

export default function HistoryView({ routes }: { routes: HistoryRoute[] }) {
  const [open, setOpen] = useState<string | null>(routes[0]?.id ?? null);

  return (
    <div className="p-5 md:p-8 md:max-w-3xl md:mx-auto">
      <h2 className="font-serif text-2xl font-light text-charcoal mb-1">History</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-6">
        Completed routes &amp; proof
      </p>

      {routes.length === 0 ? (
        <div className="bg-cream rounded-xl border border-cream-dark p-10 text-center text-charcoal/50 font-body">
          No completed routes yet.
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((r) => {
            const expanded = open === r.id;
            const done = r.stops.filter((s) => s.status === "completed").length;
            const flagged = r.stops.filter((s) => s.status === "skipped").length;
            const items = r.stops.reduce((n, s) => n + (s.pieces || 0), 0);
            const firstArrived = r.stops.map((s) => s.arrivedAt).filter(Boolean)[0] ?? null;
            const lastDone = [...r.stops].reverse().map((s) => s.completedAt).filter(Boolean)[0] ?? r.completedAt;
            const routeTotal = dur(mins(firstArrived, lastDone));
            return (
              <div key={r.id} className="bg-cream rounded-xl border border-cream-dark overflow-hidden">
                <button onClick={() => setOpen(expanded ? null : r.id)} className="w-full flex items-center justify-between p-4 text-left">
                  <div>
                    <div className="font-body font-medium text-charcoal">
                      {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div className="text-xs text-charcoal/40 font-body mt-0.5">
                      {done} delivered{items ? ` · ${items} items` : ""}{flagged ? ` · ${flagged} flagged` : ""}{routeTotal ? ` · ${routeTotal} on route` : ""}{r.completedAt ? ` · done ${time(r.completedAt)}` : ""}
                    </div>
                  </div>
                  <span className="text-charcoal/30 text-sm">{expanded ? "▲" : "▼"}</span>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-cream-dark pt-3">
                    {r.path.length >= 2 && (
                      <div className="relative h-56 rounded-lg overflow-hidden border border-cream-dark mb-1">
                        <DriverPathMap
                          path={r.path}
                          stops={r.stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lng: s.lng as number, lat: s.lat as number, name: s.name }))}
                        />
                      </div>
                    )}
                    {r.stops.map((s, i) => {
                      const isProspect = s.kind === "prospect";
                      const badgeCls = isProspect
                        ? "bg-gold-primary/25 text-gold-dark"
                        : s.status === "completed" ? "bg-green-primary text-cream"
                        : s.status === "skipped" ? "bg-gold-primary/30 text-gold-dark"
                        : "bg-cream-dark text-charcoal/50";
                      const href = isProspect ? `/sales/prospects?id=${s.prospectId}` : `/dispatch/delivery/${s.id}`;
                      const prevDone = i > 0 ? r.stops[i - 1].completedAt : null;
                      return (
                      <div key={s.id} className="flex gap-3">
                        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-body font-semibold ${badgeCls}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Link href={href} className="font-body text-sm font-medium text-charcoal underline-offset-2 hover:underline">{s.name} ›</Link>
                          {isProspect && <span className="ml-1.5 text-[10px] font-body uppercase tracking-wider px-1.5 py-0.5 rounded bg-gold-primary/20 text-gold-dark align-middle">🔔 Prospect</span>}
                          <div className="text-xs text-charcoal/40 font-body">{s.address}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] font-body text-charcoal/50">
                            {isProspect ? (
                              <span className="text-gold-dark">{s.status === "completed" ? `Visited ${time(s.completedAt)}` : "Not visited"}</span>
                            ) : (
                              <span>Arrived {time(s.arrivedAt)} → {time(s.completedAt)}</span>
                            )}
                            {!isProspect && dur(mins(s.arrivedAt, s.completedAt)) && <span className="text-green-primary">⏱ {dur(mins(s.arrivedAt, s.completedAt))} on site</span>}
                            {i > 0 && dur(mins(prevDone, s.arrivedAt ?? s.completedAt)) && <span className="text-charcoal/40">🚐 {dur(mins(prevDone, s.arrivedAt ?? s.completedAt))} drive</span>}
                            {s.dropoff && <span className="text-green-primary">↓ Drop-off</span>}
                            {s.pickup && <span className="text-gold-dark">↑ Pick-up</span>}
                            {s.pieces > 0 && <span className="text-charcoal/40">{s.pieces} pcs</span>}
                          </div>
                          {isProspect && s.notes && (
                            <div className="text-[11px] text-charcoal/60 font-body mt-0.5">📝 {s.notes}</div>
                          )}
                          {!isProspect && s.status === "skipped" && s.notes && (
                            <div className="text-[11px] text-gold-dark font-body mt-0.5">⚠ {s.notes}</div>
                          )}
                          {s.photos.length > 0 && (
                            <div className="flex gap-1.5 mt-1.5">
                              {s.photos.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={u} alt="proof" className="w-14 h-14 object-cover rounded-md border border-cream-dark" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
