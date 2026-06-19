"use client";

import { useRef } from "react";
import Map, { Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Prospect, ProspectStatus } from "@/lib/types";

const GREEN = "#02733e";
const GOLD = "#d59a29";
const GRAY = "#9a958c";
const BLACK = "#1a1a1a";

// Active = green (our customers), new/working targets = gold, on hold = grey,
// dead = black.
export function pinColor(status: ProspectStatus): string {
  if (status === "active") return GREEN;
  if (status === "dead") return BLACK;
  if (status === "on_hold") return GRAY;
  return GOLD;
}

export default function ProspectMap({
  prospects,
  targetId,
  onSelect,
}: {
  prospects: Prospect[];
  targetId: string | null;
  onSelect: (id: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const pts = prospects.filter((p) => p.lat != null && p.lng != null);

  function fitAll() {
    const m = mapRef.current;
    if (!m || pts.length === 0) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of pts) {
      minLng = Math.min(minLng, p.lng as number); maxLng = Math.max(maxLng, p.lng as number);
      minLat = Math.min(minLat, p.lat as number); maxLat = Math.max(maxLat, p.lat as number);
    }
    m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, duration: 0 });
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: -72.2, latitude: 40.96, zoom: 10 }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      onLoad={fitAll}
      attributionControl={false}
    >
      {pts.map((p) => {
        const active = p.id === targetId;
        return (
          <Marker
            key={p.id}
            longitude={p.lng as number}
            latitude={p.lat as number}
            anchor="center"
            onClick={(e) => { e.originalEvent.stopPropagation(); onSelect(p.id); }}
          >
            <div
              title={p.name}
              style={{
                width: active ? 22 : 16,
                height: active ? 22 : 16,
                borderRadius: "50%",
                background: pinColor(p.status),
                border: "2.5px solid #fff",
                boxShadow: active ? "0 0 0 5px rgba(213,154,41,0.35)" : "0 1px 4px rgba(0,0,0,0.3)",
                cursor: "pointer",
              }}
            />
          </Marker>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-cream/95 rounded-xl border border-cream-dark px-3 py-2 space-y-1 font-body text-[11px] text-charcoal/70">
        {[
          { c: GOLD, l: "Targeting" },
          { c: GREEN, l: "Active customer" },
          { c: GRAY, l: "On hold" },
          { c: BLACK, l: "Dead" },
        ].map((x) => (
          <div key={x.l} className="flex items-center gap-2">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: x.c, border: "1.5px solid #fff", boxShadow: "0 0 2px rgba(0,0,0,0.3)" }} />
            {x.l}
          </div>
        ))}
      </div>
    </Map>
  );
}
