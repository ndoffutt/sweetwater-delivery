"use client";

// Quick-look popup for a stop card on the dispatch console: today's task plus
// this customer's history, without leaving the console for the full directory
// (that's still one tap away via "Full profile").
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomerStopHistory, type StopActivity } from "@/lib/actions/customers";
import { googleVoiceCallHref, formatPhone } from "@/lib/phone";

export interface StopDetailInfo {
  customerId: string;
  name: string;
  address: string;
  town: string;
  phone: string | null;
  vip: boolean;
  pieces: number;
  hasDropoff: boolean;
  hasPickup: boolean;
  notes: string | null;
  status: string; // pending | arrived | completed | skipped
  arrivedAt: string | null;
  completedAt: string | null;
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "Not yet reached", cls: "bg-cream-dark/60 text-charcoal/50" },
  arrived: { text: "Driver on site", cls: "bg-gold-primary/25 text-gold-dark" },
  completed: { text: "Completed", cls: "bg-green-primary/15 text-green-dark" },
  skipped: { text: "Skipped", cls: "bg-red-100 text-red-700" },
};

export default function StopDetailSheet({ stop, onClose }: { stop: StopDetailInfo; onClose: () => void }) {
  const [history, setHistory] = useState<StopActivity[] | null>(null);

  useEffect(() => {
    let live = true;
    getCustomerStopHistory(stop.customerId)
      .then((rows) => { if (live) setHistory(rows); })
      .catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [stop.customerId]);

  const statusInfo = STATUS_LABEL[stop.status] ?? STATUS_LABEL.pending;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-cream w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-cream-dark">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-serif text-xl text-charcoal truncate">{stop.name}</h3>
              {stop.vip && <span className="text-gold-dark shrink-0">★</span>}
            </div>
            <p className="font-body text-xs text-charcoal/45 mt-0.5">{stop.address}{stop.town ? ` · ${stop.town}` : ""}</p>
          </div>
          <button onClick={onClose} className="shrink-0 min-h-tap min-w-tap flex items-center justify-center text-charcoal/40 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {/* Today */}
          <div>
            <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Today</p>
            <div className="bg-white/60 rounded-lg border border-cream-dark p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10.5px] font-body uppercase tracking-wider px-1.5 py-0.5 rounded ${statusInfo.cls}`}>
                  {statusInfo.text}
                </span>
                {stop.hasDropoff && <span className="text-xs text-green-primary font-body">↓ Drop-off</span>}
                {stop.hasPickup && <span className="text-xs text-gold-dark font-body">↑ Pick-up</span>}
                {stop.pieces > 0 && <span className="text-xs text-charcoal/40 font-body">{stop.pieces} pcs</span>}
              </div>
              {(stop.arrivedAt || stop.completedAt) && (
                <p className="text-xs text-charcoal/45 font-body">
                  {stop.arrivedAt ? `Arrived ${time(stop.arrivedAt)}` : ""}
                  {stop.arrivedAt && stop.completedAt ? " → " : ""}
                  {stop.completedAt ? `Done ${time(stop.completedAt)}` : ""}
                </p>
              )}
              {stop.notes && <p className="text-xs text-charcoal/70 font-body">📝 {stop.notes}</p>}
              {stop.phone && (
                <a
                  href={googleVoiceCallHref(stop.phone)}
                  className="inline-flex items-center gap-1.5 min-h-tap px-3 bg-green-primary text-cream text-xs font-body uppercase tracking-widest rounded-lg"
                >
                  📞 Call {formatPhone(stop.phone)}
                </a>
              )}
            </div>
          </div>

          {/* History */}
          <div>
            <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">
              History{history && history.length ? ` · ${history.length}` : ""}
            </p>
            {history === null ? (
              <p className="text-sm text-charcoal/40 font-body">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-charcoal/40 font-body">No prior deliveries.</p>
            ) : (
              <div className="space-y-2">
                {history.map((a) => (
                  <div key={a.id} className="bg-white/60 rounded-lg border border-cream-dark p-3">
                    <Link
                      href={`/dispatch/delivery/${a.id}`}
                      className="flex items-center gap-2 text-sm font-body text-charcoal hover:underline underline-offset-2"
                    >
                      <span className="text-charcoal/50">
                        {new Date(a.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </span>
                      {a.dropoff && <span className="text-xs text-green-primary">↓ Drop</span>}
                      {a.pickup && <span className="text-xs text-gold-dark">↑ Pick</span>}
                      {a.pieces > 0 && <span className="text-xs text-charcoal/40">{a.pieces} pcs</span>}
                      <span className="ml-auto text-charcoal/30">›</span>
                    </Link>
                    {a.photos.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {a.photos.map((u, j) => (
                          <a key={j} href={u} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="proof" className="w-14 h-14 object-cover rounded-md border border-cream-dark" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-cream-dark">
          <Link
            href={`/dispatch/customers?id=${stop.customerId}`}
            className="block text-center min-h-tap py-2.5 font-body text-xs uppercase tracking-widest text-charcoal/50"
          >
            Full profile →
          </Link>
        </div>
      </div>
    </div>
  );
}
