"use client";

import { useEffect, useRef, useState } from "react";

interface LocationTrackerProps {
  routeId: string | null;
  intervalMs?: number;
}

export default function LocationTracker({
  routeId,
  intervalMs = 30000,
}: LocationTrackerProps) {
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSend = useRef(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("GPS not available");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setTracking(true);
        setError(null);
        const now = Date.now();
        if (now - lastSend.current < intervalMs) return;
        lastSend.current = now;

        fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            routeId,
          }),
        }).catch(() => {});
      },
      (err) => {
        setTracking(false);
        setError(err.code === 1 ? "Location permission denied" : "GPS error");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [routeId, intervalMs]);

  // Quiet by design: a small dot is enough. The old version printed "Location
  // permission denied" across the top of the driver screen all day — an error
  // banner the driver can't act on mid-route is just noise. The dot's title
  // still explains itself on tap-and-hold / hover.
  return (
    <div
      className="flex items-center gap-1.5 text-xs font-body"
      title={tracking ? "GPS tracking on" : error ?? "Locating…"}
    >
      <div
        className={`w-2 h-2 rounded-full ${
          tracking ? "bg-green-light animate-pulse" : error ? "bg-red-500/70" : "bg-charcoal/30"
        }`}
      />
      {tracking && <span className="text-cream/50">GPS</span>}
    </div>
  );
}
