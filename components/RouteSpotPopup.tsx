"use client";

// After a customer is created outside the normal "add customer" flow (here:
// accepting a website signup), they still need a spot in the route — same
// required step CustomerDirectory's AddForm already makes you do when adding
// one manually. This is that same step, as a popup instead of a full page,
// so accepting a signup doesn't leave a customer sitting unpositioned until
// someone happens to notice during route building.
import { useEffect, useState } from "react";
import {
  getRoutePositioning,
  saveRoutePosition,
  placeAtEndOfRoute,
  type RoutePositioning,
} from "@/lib/actions/customers";
import RouteMap from "@/components/RouteMap";
import type { RouteStop } from "@/lib/types";

export default function RouteSpotPopup({
  customerId,
  customerName,
  onDone,
}: {
  customerId: string;
  customerName: string;
  onDone: () => void;
}) {
  const [pos, setPos] = useState<RoutePositioning | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getRoutePositioning(customerId).then((r) => { if (live) setPos(r); }).catch(() => {});
    return () => { live = false; };
  }, [customerId]);

  function confirmSuggested() {
    if (!pos?.suggestion) return;
    setBusy(true);
    saveRoutePosition(customerId, pos.suggestion.seq).then(onDone).finally(() => setBusy(false));
  }
  function addEnd() {
    setBusy(true);
    placeAtEndOfRoute(customerId).then(onDone).finally(() => setBusy(false));
  }

  const s = pos?.suggestion;
  const mapStops: RouteStop[] = (() => {
    if (!pos) return [];
    const master = pos.masterRoute;
    const list = s
      ? [...master.slice(0, s.index), { id: customerId, name: customerName, lat: s.lat, lng: s.lng }, ...master.slice(s.index)]
      : master;
    return list.map((m, i) => ({
      id: m.id, stop_order: i + 1, status: "pending",
      customer: { name: m.name, address: "", lat: m.lat, lng: m.lng },
    })) as unknown as RouteStop[];
  })();

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end md:items-center justify-center">
      <div className="bg-cream w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-5 space-y-4">
        <div>
          <h3 className="font-serif text-xl text-charcoal">Set {customerName}&apos;s route spot</h3>
          <p className="text-xs text-charcoal/50 font-body mt-1">Every customer needs a spot in the route — pick one to finish adding her.</p>
        </div>

        {!pos ? (
          <p className="text-sm text-charcoal/40 font-body">Finding the best spot…</p>
        ) : (
          <div className="bg-white/60 rounded-xl border border-cream-dark p-3">
            {s ? (
              <>
                <p className="text-sm font-body text-charcoal">
                  Suggested spot
                  {s.before && s.after ? <>, between <b>{s.before}</b> &amp; <b>{s.after}</b></>
                    : s.before ? <>, after <b>{s.before}</b></>
                    : s.after ? <>, before <b>{s.after}</b></> : null}.
                </p>
                {mapStops.length > 0 && (
                  <div className="relative h-44 mt-3 rounded-lg overflow-hidden border border-cream-dark">
                    <RouteMap stops={mapStops} targetId={customerId} onSelect={() => {}} suggestedIds={[customerId]} />
                  </div>
                )}
                <button onClick={confirmSuggested} disabled={busy} className="w-full mt-3 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
                  {busy ? "Saving…" : "Confirm this spot"}
                </button>
                <button onClick={addEnd} disabled={busy} className="w-full mt-2 min-h-tap text-charcoal/50 font-body text-[11px] uppercase tracking-widest">
                  or add to end of route
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-body text-charcoal">
                  {pos.noCoords ? "No map pin yet for this address." : "Couldn't suggest a spot."} Add it to the end of the route — you can drag it into place after.
                </p>
                <button onClick={addEnd} disabled={busy} className="w-full mt-3 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
                  {busy ? "Saving…" : "Add to end of route"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
