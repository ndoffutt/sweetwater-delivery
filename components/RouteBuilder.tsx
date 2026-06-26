"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RouteStop, Customer, RouteStatus } from "@/lib/types";
import {
  addStopToRoute,
  removeStop,
  moveStop,
  dispatchRoute,
} from "@/lib/actions/routes";

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

export default function RouteBuilder({
  routeId,
  routeStatus,
  stops: initialStops,
  customers,
}: RouteBuilderProps) {
  const [stops, setStops] = useState(initialStops);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
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

  function handleAddStop(customerId: string) {
    startTransition(async () => {
      await addStopToRoute(routeId, customerId, true, false);
      router.refresh();
      setShowAdd(false);
    });
  }

  function handleRemove(stopId: string) {
    setStops((s) => s.filter((st) => st.id !== stopId));
    startTransition(async () => {
      await removeStop(routeId, stopId);
      router.refresh();
    });
  }

  function handleMove(stopId: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveStop(routeId, stopId, direction);
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
            {/* Order controls — only for delivery stops in draft; prospect
                visits reorder via the prospect detail action (a follow-up). */}
            {isDraft && !isProspect && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMove(stop.id, "up")}
                  disabled={i === 0 || isPending}
                  className="w-8 h-8 rounded flex items-center justify-center text-charcoal/30 hover:text-charcoal disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(stop.id, "down")}
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

            {/* Info — name links to the stop's delivery detail (photos + notes);
                 the address line links to the customer profile. */}
            <div className="flex-1 min-w-0">
              <Link href={`/dispatch/delivery/${stop.id}`} className="font-body font-medium text-charcoal truncate block hover:underline underline-offset-2">
                {stop.customer?.name} ›
              </Link>
              {stop.customer?.id && (
                <Link href={`/dispatch/customers?id=${stop.customer.id}`} className="text-xs text-charcoal/40 font-body truncate block hover:underline">
                  {stop.customer?.address}
                </Link>
              )}
              <div className="flex gap-2 mt-1">
                {stop.has_dropoff && (
                  <span className="text-xs text-charcoal/40">↓ Drop-off</span>
                )}
                {stop.has_pickup && (
                  <span className="text-xs text-charcoal/40">↑ Pick-up</span>
                )}
              </div>
              {(stop.completed_at || stop.arrived_at) && (
                <p className="text-xs text-green-primary font-body mt-1">
                  {stop.completed_at
                    ? `Delivered ${fmtTime(stop.completed_at)}`
                    : `Arrived ${fmtTime(stop.arrived_at!)}`}
                </p>
              )}
            </div>

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
                      : "bg-charcoal/5 text-charcoal/30"
                  }`}
                >
                  {stop.status}
                </span>
              )}
              {isDraft && !isProspect && (
                <button
                  onClick={() => handleRemove(stop.id)}
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
    </div>
  );
}
