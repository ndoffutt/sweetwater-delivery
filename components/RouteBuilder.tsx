"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RouteStop, Customer, RouteStatus } from "@/lib/types";
import {
  addStopToRoute,
  removeStop,
  moveRouteItem,
  dispatchRoute,
} from "@/lib/actions/routes";
import { removeProspectVisit } from "@/lib/actions/prospectVisits";

interface RouteBuilderProps {
  routeId: string;
  routeStatus: RouteStatus;
  stops: RouteStop[];
  customers: Customer[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/stop-photos/`;

export default function RouteBuilder({
  routeId,
  routeStatus,
  stops: initialStops,
  customers,
}: RouteBuilderProps) {
  const [stops, setStops] = useState(initialStops);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Tapping a delivery card opens its details here (a popup), instead of
  // navigating off to a separate delivery/customer screen.
  const [detailStop, setDetailStop] = useState<RouteStop | null>(null);
  const router = useRouter();

  // Re-sync local state when the server sends fresh stops after router.refresh()
  useEffect(() => {
    setStops(initialStops);
  }, [initialStops]);

  const usedCustomerIds = new Set(stops.map((s) => s.customer_id));
  const availableCustomers = customers.filter(
    (c) => !usedCustomerIds.has(c.id)
  );
  const isDraft = routeStatus === "draft";
  // The route is editable (reorder/remove deliveries AND prospect visits) while
  // it's a draft or still out for delivery — not once it's completed.
  const editable = isDraft || routeStatus === "dispatched" || routeStatus === "in_progress";

  function handleAddStop(customerId: string) {
    startTransition(async () => {
      await addStopToRoute(routeId, customerId, true, false);
      router.refresh();
      setShowAdd(false);
    });
  }

  function handleRemove(stop: RouteStop) {
    setStops((s) => s.filter((st) => st.id !== stop.id));
    startTransition(async () => {
      if (stop.kind === "prospect_visit" && stop.prospect_visit) {
        await removeProspectVisit(routeId, stop.prospect_visit.prospect_id);
      } else {
        await removeStop(routeId, stop.id);
      }
      router.refresh();
    });
  }

  function handleMove(stop: RouteStop, direction: "up" | "down") {
    // Optimistic swap so the list reorders instantly; the server renumbers the
    // whole woven sequence (deliveries + visits) and the refresh reconciles.
    setStops((arr) => {
      const i = arr.findIndex((s) => s.id === stop.id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    startTransition(async () => {
      const kind = stop.kind === "prospect_visit" ? "visit" : "stop";
      const realId = stop.kind === "prospect_visit" && stop.prospect_visit ? stop.prospect_visit.id : stop.id;
      await moveRouteItem(routeId, realId, kind, direction);
      router.refresh();
    });
  }

  function handleDispatch() {
    if (!confirm("Dispatch this route to the driver?")) return;
    startTransition(async () => {
      await dispatchRoute(routeId);
      router.refresh();
    });
  }

  const completedCount = stops.filter((s) => s.status === "completed").length;
  const skippedCount = stops.filter((s) => s.status === "skipped").length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <p className="font-body text-sm text-charcoal/50">
          {stops.length} stops · {completedCount} completed
          {skippedCount > 0 && ` · ${skippedCount} skipped`}
        </p>
      </div>

      {/* Stops list */}
      <div className="space-y-2">
        {stops.map((stop, i) => {
          const isProspect = stop.kind === "prospect_visit";
          return (
          <div
            key={stop.id}
            className={`rounded-xl p-4 border flex items-center gap-3 ${
              isProspect ? "bg-gold-primary/5" : "bg-cream"
            } ${
              stop.status === "completed"
                ? "border-green-primary/20 opacity-60"
                : stop.status === "arrived"
                ? "border-gold-primary"
                : isProspect
                ? "border-gold-primary/30"
                : "border-cream-dark"
            }`}
          >
            {/* Order controls — reorder any stop (delivery or prospect visit)
                while the route is still editable. */}
            {editable && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(stop, "up")}
                  disabled={i === 0 || isPending}
                  className="w-8 h-8 rounded flex items-center justify-center text-charcoal/30 hover:text-charcoal disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(stop, "down")}
                  disabled={i === stops.length - 1 || isPending}
                  className="w-8 h-8 rounded flex items-center justify-center text-charcoal/30 hover:text-charcoal disabled:opacity-20"
                >
                  ▼
                </button>
              </div>
            )}

            {/* Stop number — always show the number; status is conveyed by
                the badge color + the right-side pill. Prospect visits get a
                gold ring to set them apart at a glance. */}
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-body shrink-0 ${
                stop.status === "completed"
                  ? "bg-green-primary text-cream"
                  : stop.status === "arrived"
                  ? "bg-gold-primary text-cream"
                  : isProspect
                  ? "bg-gold-primary/15 text-gold-dark ring-1 ring-gold-primary/40"
                  : "bg-cream-dark text-charcoal/50"
              }`}
            >
              {i + 1}
            </span>

            {/* Info — the whole block opens this stop's details in a popup
                (proof photos, notes, times) instead of navigating off to a
                separate delivery/customer screen. */}
            <button
              type="button"
              onClick={() => setDetailStop(stop)}
              className="flex-1 min-w-0 text-left"
            >
              <span className="font-body font-medium text-charcoal truncate block">
                {stop.customer?.name} ›
              </span>
              {stop.customer?.address && (
                <span className="text-xs text-charcoal/40 font-body truncate block">
                  {stop.customer.address}
                </span>
              )}
              <span className="flex gap-2 mt-1">
                {stop.has_dropoff && <span className="text-xs text-charcoal/40">↓ Drop-off</span>}
                {stop.has_pickup && <span className="text-xs text-charcoal/40">↑ Pick-up</span>}
              </span>
              {/* Time line follows status — a skipped stop also carries
                  completed_at (when it was flagged), so don't call it
                  "Delivered". */}
              {stop.status === "skipped" ? (
                <span className="block text-xs text-gold-dark font-body mt-1">
                  ⚠ Skipped{stop.completed_at ? ` ${fmtTime(stop.completed_at)}` : ""}{stop.notes ? ` — ${stop.notes}` : ""}
                </span>
              ) : (stop.completed_at || stop.arrived_at) ? (
                <span className="block text-xs text-green-primary font-body mt-1">
                  {stop.status === "completed" && stop.completed_at
                    ? `Delivered ${fmtTime(stop.completed_at)}`
                    : stop.arrived_at
                    ? `Arrived ${fmtTime(stop.arrived_at)}`
                    : null}
                </span>
              ) : null}
            </button>

            {/* Status */}
            <div className="text-right shrink-0">
              {isProspect && stop.status === "pending" && (
                <span className="text-xs font-body px-2 py-1 rounded-full bg-gold-primary/15 text-gold-dark">
                  🔔 Prospect
                </span>
              )}
              {!isProspect && stop.status !== "pending" && (
                <span
                  className={`text-xs font-body px-2 py-1 rounded-full ${
                    stop.status === "completed"
                      ? "bg-green-primary/10 text-green-primary"
                      : stop.status === "arrived"
                      ? "bg-gold-primary/20 text-gold-dark"
                      : "bg-gold-primary/15 text-gold-dark"
                  }`}
                >
                  {stop.status}
                </span>
              )}
              {editable && (
                <button
                  onClick={() => handleRemove(stop)}
                  disabled={isPending}
                  className="block mt-1 text-xs text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {/* Add stop */}
      {isDraft && (
        <>
          {showAdd ? (
            <div className="bg-cream rounded-xl p-4 border border-green-primary">
              <p className="font-body text-sm font-medium text-charcoal mb-3">
                Select Customer
              </p>
              {availableCustomers.length === 0 ? (
                <p className="text-sm text-charcoal/40 font-body">
                  All customers are already on this route.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAddStop(c.id)}
                      disabled={isPending}
                      className="w-full text-left p-3 rounded-lg bg-cream-dark hover:bg-green-primary/10 transition-colors"
                    >
                      <p className="font-body text-sm font-medium text-charcoal">
                        {c.name}
                      </p>
                      <p className="text-xs text-charcoal/40 font-body">
                        {c.address}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowAdd(false)}
                className="mt-3 text-xs text-charcoal/40 font-body uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full min-h-tap border-2 border-dashed border-cream-dark rounded-xl text-charcoal/30 font-body text-sm py-4 hover:border-green-primary hover:text-green-primary transition-colors"
            >
              + Add Stop
            </button>
          )}
        </>
      )}

      {/* Dispatch button */}
      {isDraft && stops.length > 0 && (
        <button
          onClick={handleDispatch}
          disabled={isPending}
          className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-4 rounded-xl mt-4"
        >
          Dispatch Route to Driver
        </button>
      )}

      {/* Delivery details popup — opened by tapping a stop card. Read-only view
          of what happened at the stop; the customer profile is one explicit tap
          away in the footer (rather than the card silently jumping there). */}
      {detailStop && (() => {
        const s = detailStop;
        const isProspect = s.kind === "prospect_visit";
        const photos = (s.photos ?? []).filter(Boolean);
        const pieces = (s as RouteStop & { piece_count?: number | null }).piece_count ?? 0;
        return (
          <div className="fixed inset-0 z-50 bg-charcoal/40 flex items-end md:items-center justify-center md:p-6" onClick={() => setDetailStop(null)}>
            <div className="bg-cream w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-cream-dark flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-light text-charcoal truncate">{s.customer?.name}</h3>
                  {s.customer?.address && <p className="font-body text-xs text-charcoal/50 mt-0.5 truncate">{s.customer.address}</p>}
                </div>
                <button onClick={() => setDetailStop(null)} className="text-charcoal/40 p-1 shrink-0 text-lg leading-none">✕</button>
              </div>

              <div className="overflow-auto p-5 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-body px-2.5 py-1 rounded-full ${
                    s.status === "completed" ? "bg-green-primary/10 text-green-primary"
                    : s.status === "skipped" ? "bg-charcoal/5 text-charcoal/40"
                    : s.status === "arrived" ? "bg-gold-primary/20 text-gold-dark"
                    : "bg-cream-dark text-charcoal/50"}`}>{isProspect ? "🔔 Prospect visit" : s.status}</span>
                  {s.has_dropoff && <span className="text-xs font-body px-2.5 py-1 rounded-full bg-cream-dark text-charcoal/60">↓ Drop-off</span>}
                  {s.has_pickup && <span className="text-xs font-body px-2.5 py-1 rounded-full bg-cream-dark text-charcoal/60">↑ Pick-up</span>}
                  {!isProspect && pieces > 0 && <span className="text-xs font-body px-2.5 py-1 rounded-full bg-cream-dark text-charcoal/60">{pieces} piece{pieces === 1 ? "" : "s"}</span>}
                </div>

                {(s.completed_at || s.arrived_at) && (
                  <div className="font-body text-sm">
                    {s.completed_at && <p className="text-green-primary">✓ {isProspect ? "Visited" : "Delivered"} {fmtTime(s.completed_at)}</p>}
                    {s.arrived_at && <p className="text-charcoal/45 text-xs mt-0.5">Arrived {fmtTime(s.arrived_at)}</p>}
                  </div>
                )}

                {s.notes && (
                  <div>
                    <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-1">Notes</p>
                    <p className="font-body text-sm text-charcoal/75 whitespace-pre-wrap">{s.notes}</p>
                  </div>
                )}

                {photos.length > 0 && (
                  <div>
                    <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-2">Proof photos</p>
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a key={p.id} href={STORAGE_BASE + p.storage_path} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-cream-dark">
                          <img src={STORAGE_BASE + p.storage_path} alt="delivery proof" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {!s.notes && photos.length === 0 && !s.completed_at && !s.arrived_at && (
                  <p className="font-body text-sm text-charcoal/40">No additional details recorded for this stop.</p>
                )}
              </div>

              {s.customer?.id && !isProspect && (
                <div className="p-4 border-t border-cream-dark shrink-0">
                  <Link href={`/dispatch/customers?id=${s.customer.id}`} className="w-full inline-flex items-center justify-center gap-2 border border-cream-dark text-green-primary rounded-xl py-3 font-body text-xs uppercase tracking-widest">
                    View customer profile →
                  </Link>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
