"use client";

import { useRef, useEffect, useState } from "react";
import Map, { Marker, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type { RouteStop } from "@/lib/types";

const GREEN = "#02733e";
const GOLD = "#d59a29";
const CHARCOAL = "#1A1A1A";

function Pin({ n, done, active, suggested }: { n: number; done?: boolean; active?: boolean; suggested?: boolean }) {
  const bg = done ? "rgba(2,115,62,0.55)" : active || suggested ? GOLD : GREEN;
  const big = active || suggested;
  return (
    <div style={{ position: "relative", filter: big ? "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}>
      {suggested && (
        <span style={{ position: "absolute", left: "50%", top: "50%", width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: "50%", background: "rgba(213,154,41,0.35)", animation: "swPulse 1.4s ease-out infinite" }} />
      )}
      <div style={{ position: "relative", width: big ? 34 : 26, height: big ? 34 : 26, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: bg, border: suggested ? "2px dashed #fff" : "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ transform: "rotate(45deg)", color: done ? "#fff" : big ? CHARCOAL : "#fff", fontFamily: '"Jost", system-ui, sans-serif', fontSize: big ? 14 : 11, fontWeight: 700 }}>
          {done ? "✓" : n}
        </span>
      </div>
    </div>
  );
}

interface Pt { id: string; order: number; done: boolean; active: boolean; suggested: boolean; lng: number; lat: number }

export default function MapboxMap({
  token, stops, targetId, onSelect, driverPos, suggestedIds,
}: { token: string; stops: RouteStop[]; targetId: string; onSelect: (id: string) => void; driverPos?: { lat: number; lng: number } | null; suggestedIds?: string[] }) {
  const suggestedSet = new Set(suggestedIds ?? []);
  const mapRef = useRef<MapRef>(null);
  const [driver, setDriver] = useState<{ lat: number; lng: number } | null>(null);

  const pts: Pt[] = stops.flatMap((s) =>
    s.customer && s.customer.lat != null && s.customer.lng != null
      ? [{ id: s.id, order: s.stop_order, done: s.status === "completed", active: s.id === targetId, suggested: suggestedSet.has(s.id), lng: s.customer.lng, lat: s.customer.lat }]
      : []
  );

  const line = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: pts.map((p) => [p.lng, p.lat]) },
  };

  function fitAll() {
    const m = mapRef.current;
    if (!m || pts.length === 0) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of pts) {
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    }
    m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 90, bottom: 340, left: 50, right: 50 }, duration: 0 });
  }

  // Ease to the active stop when it changes.
  useEffect(() => {
    const t = pts.find((p) => p.id === targetId);
    if (t && mapRef.current) mapRef.current.easeTo({ center: [t.lng, t.lat], duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  // Live driver location dot - use the supplied driverPos (manager Live view)
  // or fall back to this device's own geolocation (driver view).
  useEffect(() => {
    if (driverPos) return; // position is supplied; don't watch self.
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => setDriver({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [driverPos]);

  const dot = driverPos ?? driver;
  const center = pts[0] ?? { lng: -72.2, lat: 40.96 };

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 11 }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      onLoad={fitAll}
      attributionControl={false}
    >
      <style>{`@keyframes swPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(1.6); opacity: 0; } }`}</style>
      <Source id="route" type="geojson" data={line}>
        <Layer id="route-line" type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": GREEN, "line-width": 3, "line-opacity": 0.55, "line-dasharray": [2, 1.5] }} />
      </Source>

      {pts.map((p) => (
        <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="bottom"
          onClick={(e) => { e.originalEvent.stopPropagation(); onSelect(p.id); }}>
          <Pin n={p.order} done={p.done} active={p.active} suggested={p.suggested} />
        </Marker>
      ))}

      {dot && (
        <Marker longitude={dot.lng} latitude={dot.lat}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a7de1", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(42,125,225,0.2)" }} />
        </Marker>
      )}
    </Map>
  );
}
