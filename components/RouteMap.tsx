"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { RouteStop } from "@/lib/types";

const MapboxMap = dynamic(() => import("./MapboxMap"), { ssr: false });
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const GREEN = "#02733e";
const GOLD = "#d59a29";
const CHARCOAL = "#1A1A1A";

function pinPos(i: number, n: number) {
  const t = n > 1 ? i / (n - 1) : 0.5;
  const y = 16 + t * 66;
  const x = 50 + 30 * Math.sin(t * Math.PI * 1.7 + 0.5);
  return { x, y };
}

function StreetMap({ children }: { children?: React.ReactNode }) {
  const roadV = (x: number) => <line key={"v" + x} x1={x} y1="0" x2={x} y2="100" stroke="#fff" strokeWidth={0.8} strokeOpacity="0.9" />;
  const roadH = (y: number) => <line key={"h" + y} x1="0" y1={y} x2="100" y2={y} stroke="#fff" strokeWidth={0.8} strokeOpacity="0.9" />;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#EAE6DC" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="100" height="100" fill="#EDE8DD" />
        <ellipse cx="28" cy="22" rx="14" ry="9" fill="#dfe7d2" />
        <ellipse cx="82" cy="58" rx="11" ry="13" fill="#dfe7d2" />
        <ellipse cx="50" cy="80" rx="20" ry="10" fill="#dfe7d2" />
        <path d="M0 92 Q40 84 70 90 T100 88 V100 H0 Z" fill="#cfe0e6" />
        <g>
          {[14, 28, 42, 56, 70, 84].map(roadV)}
          {[16, 32, 48, 64, 80].map(roadH)}
        </g>
        <path d="M-2 64 Q30 56 60 60 T102 52" stroke="#fff" strokeWidth="3" fill="none" strokeOpacity="0.95" />
        <path d="M20 -2 Q26 30 40 50 T58 102" stroke="#fff" strokeWidth="2.6" fill="none" strokeOpacity="0.95" />
      </svg>
      <span style={{ position: "absolute", left: "8%", top: "60%", transform: "rotate(-6deg)", fontFamily: '"Jost", system-ui, sans-serif', fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,26,26,0.32)", pointerEvents: "none" }}>Montauk Hwy</span>
      <span style={{ position: "absolute", left: "70%", top: "86%", fontFamily: '"Jost", system-ui, sans-serif', fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,26,26,0.32)", pointerEvents: "none" }}>Atlantic Ocean</span>
      {children}
    </div>
  );
}

function Pin({ n, done, active }: { n: number; done?: boolean; active?: boolean }) {
  const bg = done ? "rgba(2,115,62,0.55)" : active ? GOLD : GREEN;
  return (
    <div style={{ position: "relative", filter: active ? "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}>
      <div style={{ width: active ? 36 : 28, height: active ? 36 : 28, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", background: bg, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ transform: "rotate(45deg)", color: done ? "#fff" : active ? CHARCOAL : "#fff", fontFamily: '"Jost", system-ui, sans-serif', fontSize: active ? 15 : 12, fontWeight: 700 }}>
          {done ? "✓" : n}
        </span>
      </div>
    </div>
  );
}

export default function RouteMap({
  stops, targetId, onSelect, driverPos, suggestedIds,
}: { stops: RouteStop[]; targetId: string; onSelect: (id: string) => void; driverPos?: { lat: number; lng: number } | null; suggestedIds?: string[] }) {
  const hasCoords = stops.some((s) => s.customer?.lat != null && s.customer?.lng != null);

  // In a dead zone Mapbox can't fetch tiles (blank canvas), so fall back to
  // the stylized map - the numbered pins and route order still read fine.
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (TOKEN && hasCoords && online) {
    return <MapboxMap token={TOKEN} stops={stops} targetId={targetId} onSelect={onSelect} driverPos={driverPos} suggestedIds={suggestedIds} />;
  }

  // Stylized fallback (no map token / no coordinates).
  return (
    <StreetMap>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <polyline points={stops.map((s, i) => { const p = pinPos(i, stops.length); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke={GREEN} strokeOpacity="0.4" strokeWidth="0.9" strokeDasharray="2 1.6" strokeLinecap="round" />
      </svg>
      {stops.map((s, i) => {
        const p = pinPos(i, stops.length);
        return (
          <button key={s.id} onClick={() => onSelect(s.id)} style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-100%)", cursor: "pointer", background: "none", border: "none", padding: 0, zIndex: s.id === targetId ? 6 : 2 }}>
            <Pin n={s.stop_order} done={s.status === "completed"} active={s.id === targetId} />
          </button>
        );
      })}
      <div style={{ position: "absolute", left: "70%", top: "20%", transform: "translate(-50%,-50%)", zIndex: 7 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a7de1", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(42,125,225,0.2)" }} />
      </div>
    </StreetMap>
  );
}
