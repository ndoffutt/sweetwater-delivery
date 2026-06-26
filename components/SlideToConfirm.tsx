"use client";

import { useRef, useState } from "react";

const GREEN = "#02733e";
const CREAM = "#FAF7F2";

// Drag-the-knob-to-confirm control. Self-contained (no app-wide deps) so both
// the delivery flow and the prospect-visit sheet can use the same gesture.
export default function SlideToConfirm({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const xRef = useRef(0);
  const knob = 56;
  const maxX = () => (trackRef.current ? trackRef.current.offsetWidth : 300) - knob - 6;
  function setKnob(v: number) { xRef.current = v; setX(v); }
  function down(clientX: number) {
    const start = clientX - xRef.current;
    setDragging(true);
    const onMove = (e: MouseEvent | TouchEvent) => {
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      setKnob(Math.max(0, Math.min(maxX(), cx - start)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
      setDragging(false);
      if (xRef.current > maxX() * 0.82) { setKnob(maxX()); setDone(true); setTimeout(onConfirm, 240); }
      else setKnob(0);
    };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false }); window.addEventListener("touchend", onUp);
  }
  const pct = trackRef.current ? x / maxX() : 0;
  return (
    <div ref={trackRef} style={{ position: "relative", height: 62, borderRadius: 16, background: "rgba(2,115,62,0.1)", border: "1.5px solid rgba(2,115,62,0.25)", overflow: "hidden", userSelect: "none", touchAction: "none" }}>
      {/* Label sits in the track to the RIGHT of the knob's resting spot, so a
          long label (e.g. "Slide to log touchpoint") is never clipped by it. */}
      <div style={{ position: "absolute", left: knob + 14, right: 14, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: '"Jost", system-ui, sans-serif', fontSize: 13.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: GREEN, opacity: 1 - pct * 1.2, whiteSpace: "nowrap", overflow: "hidden" }}>
        {done ? "" : label}
      </div>
      <div
        onMouseDown={(e) => down(e.clientX)}
        onTouchStart={(e) => down(e.touches[0].clientX)}
        style={{ position: "absolute", top: 3, left: 3, width: knob, height: 52, borderRadius: 13, background: GREEN, transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .2s", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", boxShadow: "0 3px 10px rgba(2,115,62,0.35)" }}
      >
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          {done ? <polyline points="20 6 9 17 4 12" /> : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </div>
    </div>
  );
}
