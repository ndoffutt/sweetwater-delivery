"use client";

import { useRef } from "react";
import Map, { Source, Layer, Marker, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

interface Pt { lng: number; lat: number }

// Shows the driver's actual GPS breadcrumb for a route (green line) with the
// route's stops as dots, and start/end markers.
export default function DriverPathMap({
  path,
  stops = [],
}: {
  path: Pt[];
  stops?: { lng: number; lat: number; name: string }[];
}) {
  const mapRef = useRef<MapRef>(null);
  const all = [...path, ...stops];

  function fit() {
    const m = mapRef.current;
    if (!m || all.length === 0) return;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of all) {
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    }
    m.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 36, duration: 0 });
  }

  const line = {
    type: "Feature" as const,
    geometry: { type: "LineString" as const, coordinates: path.map((p) => [p.lng, p.lat]) },
    properties: {},
  };
  const start = path[0];
  const end = path[path.length - 1];

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: start?.lng ?? -72.2, latitude: start?.lat ?? 40.96, zoom: 11 }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      onLoad={fit}
      attributionControl={false}
    >
      <Source id="driver-path" type="geojson" data={line}>
        <Layer id="driver-path-line" type="line" paint={{ "line-color": "#02733e", "line-width": 3, "line-opacity": 0.85 }} layout={{ "line-cap": "round", "line-join": "round" }} />
      </Source>

      {stops.map((s, i) => (
        <Marker key={`s${i}`} longitude={s.lng} latitude={s.lat} anchor="center">
          <div title={s.name} style={{ width: 10, height: 10, borderRadius: "50%", background: "#d59a29", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        </Marker>
      ))}

      {start && (
        <Marker longitude={start.lng} latitude={start.lat} anchor="center">
          <div title="Start" style={{ width: 14, height: 14, borderRadius: "50%", background: "#02733e", border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
        </Marker>
      )}
      {end && (
        <Marker longitude={end.lng} latitude={end.lat} anchor="center">
          <div title="End" style={{ width: 14, height: 14, borderRadius: "50%", background: "#1a1a1a", border: "2.5px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
        </Marker>
      )}
    </Map>
  );
}
