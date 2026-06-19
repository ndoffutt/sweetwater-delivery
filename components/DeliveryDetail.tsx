"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateDelivery } from "@/lib/actions/stops";
import { googleVoiceCallHref } from "@/lib/phone";
import type { StopStatus } from "@/lib/types";

interface DeliveryStop {
  id: string;
  status: string;
  hasDropoff: boolean;
  hasPickup: boolean;
  pieceCount: number;
  notes: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  customerName: string;
  address: string;
  phone?: string | null;
  date: string | null;
  photos: string[];
}

const STATUSES: { id: StopStatus; label: string }[] = [
  { id: "completed", label: "Completed" },
  { id: "skipped", label: "Skipped" },
  { id: "pending", label: "Pending" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "—";
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

export default function DeliveryDetail({ stop }: { stop: DeliveryStop }) {
  const router = useRouter();
  const [dropoff, setDropoff] = useState(stop.hasDropoff);
  const [pickup, setPickup] = useState(stop.hasPickup);
  const [pieces, setPieces] = useState(stop.pieceCount);
  const [notes, setNotes] = useState(stop.notes ?? "");
  const [status, setStatus] = useState<StopStatus>((stop.status as StopStatus) ?? "completed");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    dropoff !== stop.hasDropoff ||
    pickup !== stop.hasPickup ||
    pieces !== stop.pieceCount ||
    notes !== (stop.notes ?? "") ||
    status !== (stop.status as StopStatus);

  async function save() {
    setSaving(true);
    const res = await updateDelivery(stop.id, {
      has_dropoff: dropoff,
      has_pickup: pickup,
      piece_count: pieces,
      notes,
      status,
    });
    setSaving(false);
    if (!res.error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    }
  }

  return (
    <div className="p-5 md:p-8 md:max-w-2xl md:mx-auto space-y-5">
      <Link href="/owner" className="text-xs text-charcoal/50 font-body uppercase tracking-widest">← Back</Link>

      <div>
        <h2 className="font-serif text-3xl font-light text-charcoal">{stop.customerName}</h2>
        <p className="text-xs text-charcoal/40 font-body mt-1">
          Delivery · {fmtDate(stop.date)}{fmtTime(stop.completedAt) ? ` · delivered ${fmtTime(stop.completedAt)}` : ""}
        </p>
      </div>

      <div className="space-y-2">
        {stop.address && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-green-primary font-body underline underline-offset-2">{stop.address}</a>
        )}
        {stop.phone && (
          <a href={googleVoiceCallHref(stop.phone)} target="_blank" rel="noopener noreferrer" className="block text-sm text-charcoal/70 font-body">📞 {stop.phone}</a>
        )}
      </div>

      {/* Tasks */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">This stop</p>
        <div className="flex gap-2">
          <button onClick={() => setDropoff((v) => !v)} className={`flex-1 min-h-tap py-2.5 rounded-lg text-xs font-body uppercase tracking-widest border ${dropoff ? "bg-green-primary border-green-primary text-cream" : "bg-cream border-cream-dark text-charcoal/50"}`}>
            {dropoff ? "★ " : ""}Drop-off
          </button>
          <button onClick={() => setPickup((v) => !v)} className={`flex-1 min-h-tap py-2.5 rounded-lg text-xs font-body uppercase tracking-widest border ${pickup ? "bg-green-primary border-green-primary text-cream" : "bg-cream border-cream-dark text-charcoal/50"}`}>
            {pickup ? "★ " : ""}Pickup
          </button>
        </div>
      </div>

      {/* Pieces */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Pieces</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setPieces((p) => Math.max(0, p - 1))} className="w-10 h-10 rounded-lg bg-cream-dark text-charcoal text-xl font-body">−</button>
          <span className="w-12 text-center font-body text-lg text-charcoal">{pieces}</span>
          <button onClick={() => setPieces((p) => p + 1)} className="w-10 h-10 rounded-lg bg-cream-dark text-charcoal text-xl font-body">+</button>
        </div>
      </div>

      {/* Status */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Status</p>
        <div className="flex gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.id} onClick={() => setStatus(s.id)} className={`min-h-tap px-3.5 py-1.5 rounded-full text-xs font-body ${status === s.id ? "bg-green-primary text-cream" : "bg-cream border border-cream-dark text-charcoal/50"}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-green-primary/5 border border-green-primary/20 rounded-xl p-3">
        <label className="text-xs text-green-primary font-body uppercase tracking-widest block mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Delivery notes…" className="w-full bg-transparent text-sm font-body text-charcoal resize-none focus:outline-none placeholder:text-charcoal/30" />
      </div>

      {/* Proof photos */}
      {stop.photos.length > 0 && (
        <div>
          <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Proof of delivery</p>
          <div className="grid grid-cols-3 gap-2">
            {stop.photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block">
                <img src={src} alt="proof of delivery" className="w-full h-24 object-cover rounded-lg border border-cream-dark" />
              </a>
            ))}
          </div>
        </div>
      )}

      {dirty && (
        <button onClick={save} disabled={saving} className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
      )}
      {saved && <p className="text-center text-xs text-green-primary font-body">✓ Saved</p>}
    </div>
  );
}
