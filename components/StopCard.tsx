"use client";

import Link from "next/link";
import type { RouteStop } from "@/lib/types";

interface StopCardProps {
  stop: RouteStop;
  index: number;
  isNext?: boolean;
}

const statusColors: Record<string, string> = {
  pending: "bg-charcoal/10 text-charcoal/60",
  arrived: "bg-gold-primary/20 text-gold-dark",
  completed: "bg-green-primary/10 text-green-primary",
  skipped: "bg-charcoal/5 text-charcoal/30",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  arrived: "Arrived",
  completed: "Done",
  skipped: "Skipped",
};

export default function StopCard({ stop, index, isNext }: StopCardProps) {
  const customer = stop.customer;
  if (!customer) return null;

  return (
    <Link
      href={`/driver/stop/${stop.id}`}
      className={`block rounded-xl p-4 transition-all ${
        isNext
          ? "bg-cream border-2 border-green-primary shadow-md"
          : stop.status === "completed"
          ? "bg-cream-dark/50 opacity-70"
          : "bg-cream border border-cream-dark"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-body font-medium ${
              stop.status === "completed"
                ? "bg-green-primary text-cream"
                : isNext
                ? "bg-green-primary text-cream"
                : "bg-cream-dark text-charcoal/60"
            }`}
          >
            {stop.status === "completed" ? "✓" : index + 1}
          </span>
          <div>
            <h3 className="font-body font-medium text-charcoal">
              {customer.name}
            </h3>
            <p className="text-xs text-charcoal/50 font-body">
              {customer.address}
            </p>
          </div>
        </div>
        <span
          className={`text-xs font-body px-2 py-1 rounded-full ${
            statusColors[stop.status]
          }`}
        >
          {statusLabels[stop.status]}
        </span>
      </div>

      <div className="flex items-center gap-3 ml-11">
        {stop.has_dropoff && (
          <span className="text-xs font-body text-charcoal/50 flex items-center gap-1">
            <span className={stop.dropoff_confirmed ? "text-green-primary" : ""}>
              ↓ Drop-off
            </span>
          </span>
        )}
        {stop.has_pickup && (
          <span className="text-xs font-body text-charcoal/50 flex items-center gap-1">
            <span className={stop.pickup_confirmed ? "text-green-primary" : ""}>
              ↑ Pick-up
            </span>
          </span>
        )}
        {customer.gate_code && (
          <span className="text-xs font-body text-gold-dark flex items-center gap-1">
            🔑 Gate
          </span>
        )}
      </div>

      {isNext && (
        <div className="mt-3 ml-11">
          <span className="text-xs font-body text-green-primary font-medium uppercase tracking-widest">
            Next Stop →
          </span>
        </div>
      )}
    </Link>
  );
}
