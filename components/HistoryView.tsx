"use client";

import { useState } from "react";

export interface HistoryStop {
  order: number;
  name: string;
  address: string;
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
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "·";

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
            return (
              <div key={r.id} className="bg-cream rounded-xl border border-cream-dark overflow-hidden">
                <button onClick={() => setOpen(expanded ? null : r.id)} className="w-full flex items-center justify-between p-4 text-left">
                  <div>
                    <div className="font-body font-medium text-charcoal">
                      {new Date(r.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                    <div className="text-xs text-charcoal/40 font-body mt-0.5">
                      {done} delivered{items ? ` · ${items} items` : ""}{flagged ? ` · ${flagged} flagged` : ""}{r.completedAt ? ` · done ${time(r.completedAt)}` : ""}
                    </div>
                  </div>
                  <span className="text-charcoal/30 text-sm">{expanded ? "▲" : "▼"}</span>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 space-y-2 border-t border-cream-dark pt-3">
                    {r.stops.map((s) => (
                      <div key={s.order} className="flex gap-3">
                        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-body ${s.status === "completed" ? "bg-green-primary text-cream" : s.status === "skipped" ? "bg-gold-primary/30 text-gold-dark" : "bg-cream-dark text-charcoal/50"}`}>
                          {s.status === "completed" ? "✓" : s.status === "skipped" ? "!" : s.order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-sm font-medium text-charcoal">{s.name}</div>
                          <div className="text-xs text-charcoal/40 font-body">{s.address}</div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] font-body text-charcoal/50">
                            <span>Arrived {time(s.arrivedAt)} → {time(s.completedAt)}</span>
                            {s.dropoff && <span className="text-green-primary">↓ Drop-off</span>}
                            {s.pickup && <span className="text-gold-dark">↑ Pick-up</span>}
                            {s.pieces > 0 && <span className="text-charcoal/40">{s.pieces} pcs</span>}
                          </div>
                          {s.status === "skipped" && s.notes && (
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
                    ))}
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
