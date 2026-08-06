"use client";

// Third column of the desktop Messages view (xl and up): the customer this
// thread belongs to, so you're not guessing at delivery notes or gate codes
// while you type a reply. Read-only — full edit lives at the directory link.
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomerFile, getCustomerStopHistory, type CustomerFile, type StopActivity } from "@/lib/actions/customers";
import { InfoTile } from "@/components/AccountBits";
import { googleVoiceCallHref, formatPhone } from "@/lib/phone";

export default function CustomerFilePanel({ customerId }: { customerId: string }) {
  const [file, setFile] = useState<CustomerFile | null | undefined>(undefined);
  const [history, setHistory] = useState<StopActivity[] | null>(null);

  useEffect(() => {
    let live = true;
    setFile(undefined);
    setHistory(null);
    getCustomerFile(customerId).then((f) => { if (live) setFile(f); }).catch(() => { if (live) setFile(null); });
    getCustomerStopHistory(customerId).then((rows) => { if (live) setHistory(rows); }).catch(() => { if (live) setHistory([]); });
    return () => { live = false; };
  }, [customerId]);

  if (file === undefined) {
    return <div className="p-4 text-sm text-charcoal/40 font-body">Loading…</div>;
  }
  if (file === null) {
    return <div className="p-4 text-sm text-charcoal/40 font-body">Customer record not found.</div>;
  }

  const vip = (file.tags ?? []).includes("VIP");

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="font-serif text-xl text-charcoal truncate">{file.name}</h3>
          {vip && <span className="text-gold-dark shrink-0">★</span>}
        </div>
        {file.tags && file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {file.tags.map((t) => (
              <span key={t} className="text-[10px] font-body uppercase tracking-wide px-1.5 py-0.5 rounded bg-cream-dark/60 text-charcoal/55">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <InfoTile icon="📍" label="Address" value={file.address}
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(file.address)}`} />
        {file.phone && <InfoTile icon="📞" label="Phone" value={formatPhone(file.phone)} href={googleVoiceCallHref(file.phone)} action="Call" />}
        {file.email && <InfoTile icon="✉️" label="Email" value={file.email} href={`mailto:${file.email}`} action="Email" />}
        <InfoTile icon="🔑" label="Gate / entry code" value={file.gate_code || "—"} mono={!!file.gate_code} />
      </div>

      {file.delivery_notes && (
        <div>
          <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-1">Delivery notes</p>
          <p className="text-sm text-charcoal/75 font-body">{file.delivery_notes}</p>
        </div>
      )}

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
              <div key={a.id} className="bg-cream-dark/25 rounded-lg p-2.5">
                <Link
                  href={`/dispatch/delivery/${a.id}`}
                  className="flex items-center gap-2 text-sm font-body text-charcoal hover:underline underline-offset-2"
                >
                  <span className="text-charcoal/50">
                    {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {a.dropoff && <span className="text-xs text-green-primary">↓ Drop</span>}
                  {a.pickup && <span className="text-xs text-gold-dark">↑ Pick</span>}
                  {a.pieces > 0 && <span className="text-xs text-charcoal/40">{a.pieces} pcs</span>}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/dispatch/customers?id=${file.id}`}
        className="block text-center py-2.5 font-body text-xs uppercase tracking-widest text-charcoal/50 border-t border-cream-dark"
      >
        Full profile →
      </Link>
    </div>
  );
}
