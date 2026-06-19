"use client";

import { useState, useTransition } from "react";
import { completeProspectVisit, removeProspectVisit } from "@/lib/actions/prospectVisits";

export interface PlannedVisit {
  id: string;
  prospectId: string;
  name: string;
  status: string;
  notes: string | null;
}

// The prospect visits planned for today's route. When the manager gets to one,
// he logs it with a required note — which records a visit on the prospect.
export default function PlannedVisits({
  routeId,
  visits: initial,
}: {
  routeId: string;
  visits: PlannedVisit[];
}) {
  const [visits, setVisits] = useState<PlannedVisit[]>(initial);
  const [logId, setLogId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  if (visits.length === 0) return null;

  function save(v: PlannedVisit) {
    if (!note.trim()) { setError("Add a quick note about the visit."); return; }
    setBusy(true);
    setError("");
    start(async () => {
      const res = await completeProspectVisit(v.id, v.prospectId, note);
      setBusy(false);
      if (res.error) { setError(res.error); return; }
      setVisits((vs) => vs.map((x) => (x.id === v.id ? { ...x, status: "visited", notes: note.trim() } : x)));
      setLogId(null);
      setNote("");
    });
  }

  function remove(v: PlannedVisit) {
    start(async () => {
      await removeProspectVisit(routeId, v.prospectId);
      setVisits((vs) => vs.filter((x) => x.id !== v.id));
    });
  }

  return (
    <div className="mt-4 bg-cream rounded-2xl border border-green-primary/30 p-4 md:p-5">
      <p className="font-body text-[11px] uppercase tracking-widest text-green-primary mb-3">Planned prospect visits</p>
      <div className="divide-y divide-cream-dark">
        {visits.map((v) => {
          const done = v.status === "visited";
          return (
            <div key={v.id} className="py-2.5">
              <div className="flex items-center gap-3">
                <span className="shrink-0">{done ? "✅" : "📍"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-body text-sm text-charcoal truncate">{v.name}</p>
                  {done && v.notes && <p className="text-xs text-charcoal/45 font-body truncate">Visited — {v.notes}</p>}
                </div>
                {done ? (
                  <span className="shrink-0 text-[11px] font-body uppercase tracking-widest text-green-primary">Visited</span>
                ) : (
                  <button onClick={() => { setLogId(logId === v.id ? null : v.id); setNote(""); setError(""); }} className="shrink-0 min-h-tap px-3 py-1.5 rounded-lg bg-green-primary text-cream text-xs font-body uppercase tracking-widest">
                    Log visit
                  </button>
                )}
              </div>
              {logId === v.id && !done && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="What happened on the visit? (required)"
                    className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => save(v)} disabled={busy} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-2.5 rounded-lg disabled:opacity-60">
                      {busy ? "Saving…" : "Save visit"}
                    </button>
                    <button onClick={() => remove(v)} disabled={busy} className="min-h-tap px-3 text-charcoal/40 font-body text-xs uppercase tracking-widest">Remove</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-600 font-body mt-2">{error}</p>}
    </div>
  );
}
