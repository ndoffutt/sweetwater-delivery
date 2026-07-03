"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import RouteMap from "./RouteMap";
import type { RouteStop } from "@/lib/types";

interface LiveRoute {
  id: string;
  date: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  route_stops: RouteStop[];
}
interface DriverLoc {
  lat: number;
  lng: number;
  accuracy: number | null;
  created_at: string;
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "·";

const elapsed = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

export default function LiveView() {
  const [route, setRoute] = useState<LiveRoute | null>(null);
  const [driver, setDriver] = useState<DriverLoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [stale, setStale] = useState(false);
  const [target, setTarget] = useState<string>("");
  const touched = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRoute(data.route);
      setDriver(data.driver);
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const stops = route?.route_stops ?? [];
  const done = stops.filter((s) => s.status === "completed" || s.status === "skipped").length;
  // The stop the driver is currently working (arrived, else first non-finished).
  const current =
    stops.find((s) => s.status === "arrived") ??
    stops.find((s) => s.status !== "completed" && s.status !== "skipped") ??
    null;

  // Auto-follow the current stop unless the manager has clicked a pin.
  const focusId = touched.current ? target : current?.id ?? "";

  const driverPos = driver ? { lat: driver.lat, lng: driver.lng } : null;
  const lastPing = driver ? new Date(driver.created_at) : null;
  const pingAgeMin = lastPing ? Math.round((Date.now() - lastPing.getTime()) / 60000) : null;

  if (!loaded) {
    return (
      <div className="p-6 md:max-w-3xl md:mx-auto">
        <div className="bg-cream rounded-xl border border-cream-dark p-10 text-center text-charcoal/40 font-body">
          Loading live route…
        </div>
      </div>
    );
  }

  if (!route) {
    return (
      <div className="p-6 md:max-w-3xl md:mx-auto">
        <h2 className="hidden md:block font-serif text-2xl font-light text-charcoal">Live</h2>
        <p className="hidden md:block text-xs text-charcoal/40 font-body uppercase tracking-widest mb-6">
          Driver tracking
        </p>
        <div className="bg-cream rounded-xl border border-cream-dark p-10 text-center">
          <div className="text-3xl mb-3">📍</div>
          <p className="font-body text-charcoal/60">No route is out for delivery today.</p>
          <a href="/dispatch" className="inline-block mt-4 min-h-tap px-5 py-2.5 bg-green-primary text-cream text-xs font-body uppercase tracking-widest rounded-lg">
            Go to Dispatch
          </a>
        </div>
      </div>
    );
  }

  const pct = stops.length ? (done / stops.length) * 100 : 0;

  return (
    <div className="md:max-w-3xl md:mx-auto">
      {/* Map */}
      <div className="relative h-[42vh] md:h-80 md:rounded-xl md:overflow-hidden md:mt-6 md:border md:border-cream-dark">
        <RouteMap
          stops={stops}
          targetId={focusId}
          onSelect={(id) => {
            touched.current = true;
            setTarget(id);
          }}
          driverPos={driverPos}
        />
        {/* Live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-charcoal/80 text-cream rounded-full px-3 py-1.5 backdrop-blur">
          <span className={`w-2 h-2 rounded-full ${stale ? "bg-gold-primary" : "bg-green-400 animate-pulse"}`} />
          <span className="text-[11px] font-body uppercase tracking-widest">
            {stale ? "Reconnecting" : "Live"}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Status summary */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-light text-charcoal">
              {route.status === "in_progress" ? "On the road" : route.status === "dispatched" ? "Dispatched" : "Today's route"}
            </h2>
            <p className="text-xs text-charcoal/40 font-body mt-0.5">
              {done}/{stops.length} stops · started {time(route.started_at)}
              {route.status === "in_progress" && route.started_at && ` · out ${elapsed(route.started_at)}`}
              {pingAgeMin != null && ` · ping ${pingAgeMin <= 0 ? "just now" : `${pingAgeMin}m ago`}`}
            </p>
          </div>
          {driverPos && (
            <a
              href={`https://maps.google.com/?q=${driverPos.lat},${driverPos.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-tap px-4 py-2 bg-green-primary text-cream text-xs font-body uppercase tracking-widest rounded-lg shrink-0"
            >
              Open map
            </a>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-cream-dark rounded-full overflow-hidden">
          <div className="h-full bg-green-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>

        {/* Currently at */}
        {current && (
          <div className="bg-gold-primary/15 border border-gold-primary/40 rounded-xl p-4">
            <p className="text-[11px] text-gold-dark font-body uppercase tracking-widest mb-1">
              {current.status === "arrived" ? "Currently at" : "Heading to"}
            </p>
            <p className="font-body font-medium text-charcoal">
              {current.stop_order}. {current.customer?.name ?? "Unknown"}
            </p>
            <p className="text-xs text-charcoal/40 font-body">{current.customer?.address}</p>
          </div>
        )}

        {/* Stop list */}
        <div className="space-y-1.5">
          {stops.map((s) => {
            const isCurrent = s.id === current?.id;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  touched.current = true;
                  setTarget(s.id);
                }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touched.current = true; setTarget(s.id); } }}
                className={`w-full flex items-center gap-3 py-1.5 px-2 rounded-lg text-left cursor-pointer ${
                  s.id === focusId ? "bg-cream-dark/60" : ""
                }`}
              >
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-body ${
                    s.status === "completed"
                      ? "bg-green-primary text-cream"
                      : s.status === "skipped"
                      ? "bg-gold-primary/30 text-gold-dark"
                      : s.status === "arrived"
                      ? "bg-gold-primary text-charcoal"
                      : "bg-cream-dark text-charcoal/50"
                  }`}
                >
                  {s.status === "completed" ? "✓" : s.status === "skipped" ? "!" : s.stop_order}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`font-body text-sm truncate ${s.status === "completed" ? "text-charcoal/40 line-through" : "text-charcoal"}`}>
                    {s.customer?.name ?? "Unknown"}
                    {isCurrent && <span className="ml-2 text-[10px] text-gold-dark uppercase tracking-widest">now</span>}
                  </div>
                </div>
                <span className="text-[11px] text-charcoal/30 font-body shrink-0">
                  {s.status === "completed" ? time(s.completed_at) : s.status === "arrived" ? `arr ${time(s.arrived_at)}` : ""}
                </span>
                <a
                  href={`/dispatch/delivery/${s.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 min-w-tap min-h-tap flex items-center justify-center text-charcoal/30 hover:text-charcoal/60"
                  title="Open delivery detail"
                >
                  ›
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
