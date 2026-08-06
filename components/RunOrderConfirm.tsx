"use client";

// Confirm the run before driving it.
//
// Routes were driven in their planned order 0 times out of 9 — usually run
// from the other end, which is a fine call and was invisible to the office.
// This asks once, up front, so the sequence in the app is the sequence on the
// road. That is what makes a stop-count ETA honest: two stops ahead is 88%
// accurate to within 15 minutes, but only against a real order.
//
// Drag to reorder, or Reverse in one tap — reversing alone would have fixed
// 2026-07-30 and most of 2026-08-05.
import { useRef, useState } from "react";
import { confirmRunOrder } from "@/lib/actions/runOrder";

export interface RunStop {
  id: string;
  name: string;
  town: string;
  drop: boolean;
  pick: boolean;
}

const C = {
  cream: "#FAF6EC", creamDark: "#EAE4D3", charcoal: "#2b2b2b",
  green: "#02733e", gold: "#d59a29", goldDark: "#9a7b1f",
};

export default function RunOrderConfirm({
  routeId,
  stops: initial,
  onDone,
}: {
  routeId: string;
  stops: RunStop[];
  onDone: () => void;
}) {
  const [stops, setStops] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function move(srcId: string, targetId: string) {
    if (srcId === targetId) return;
    setStops((cur) => {
      const from = cur.findIndex((s) => s.id === srcId);
      const to = cur.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  }

  // Pointer-based so it works under a thumb; HTML5 drag doesn't fire on touch.
  function onMove(e: React.PointerEvent) {
    if (!dragId) return;
    const y = e.clientY;
    for (const s of stops) {
      const el = rowRefs.current[s.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { move(dragId, s.id); break; }
    }
  }

  function confirm() {
    // Never block the driver on the network. The modal closes immediately and
    // the write goes in the background — out here a request hangs rather than
    // failing, and a van waiting on a spinner is the worse outcome.
    setSaving(true);
    onDone();
    void confirmRunOrder(routeId, stops.map((s) => s.id)).catch(() => {});
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end" }}
    >
      <div style={{ background: C.cream, width: "100%", maxHeight: "92vh", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 18px 12px", borderBottom: `1px solid ${C.creamDark}` }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: C.charcoal }}>Confirm your run</div>
          <div style={{ fontSize: 13.5, color: "rgba(43,43,43,.6)", marginTop: 4, lineHeight: 1.4 }}>
            Put these in the order you&apos;ll actually drive them. Drag to move, or
            reverse the whole run.
          </div>
          <button
            onClick={() => setStops((c) => [...c].reverse())}
            style={{ marginTop: 12, minHeight: 44, padding: "0 16px", background: "#fff", border: `1px solid ${C.creamDark}`, borderRadius: 12, fontSize: 14, color: C.charcoal, cursor: "pointer" }}
          >
            ⇅ Reverse the order
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 12px", flex: 1 }} onPointerMove={onMove} onPointerUp={() => setDragId(null)}>
          {stops.map((s, i) => (
            <div
              key={s.id}
              ref={(el) => { rowRefs.current[s.id] = el; }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: dragId === s.id ? "#fff" : "transparent",
                border: `1px solid ${dragId === s.id ? C.gold : "transparent"}`,
                borderRadius: 12, padding: "8px 6px", marginBottom: 2,
                boxShadow: dragId === s.id ? "0 6px 18px rgba(0,0,0,.15)" : "none",
              }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 999, background: C.green, color: C.cream, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "rgba(43,43,43,.5)" }}>
                  {s.town}
                  {s.drop ? " · ↓ Drop" : ""}{s.pick ? " · ↑ Pick" : ""}
                </div>
              </div>
              {/* Big grab handle — this is used outdoors, one-handed. */}
              <div
                onPointerDown={(e) => { e.preventDefault(); setDragId(s.id); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
                style={{ width: 46, height: 46, display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", touchAction: "none", color: "rgba(43,43,43,.35)", flexShrink: 0 }}
                aria-label={`Move ${s.name}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 9h16M4 15h16" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 14, borderTop: `1px solid ${C.creamDark}` }}>
          <button
            onClick={confirm}
            disabled={saving}
            style={{ width: "100%", minHeight: 54, background: C.green, color: C.cream, border: "none", borderRadius: 15, fontSize: 15, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer" }}
          >
            {saving ? "Starting…" : `Start run · ${stops.length} stops`}
          </button>
        </div>
      </div>
    </div>
  );
}
