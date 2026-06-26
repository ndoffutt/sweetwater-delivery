"use client";

import { useState, useTransition } from "react";
import { runStopAction } from "@/lib/offline";
import { googleVoiceCallHref } from "@/lib/phone";
import SlideToConfirm from "@/components/SlideToConfirm";
import type { RouteStop } from "@/lib/types";

const ICON: Record<string, string> = {
  visit: "🚪", delivery: "🚐", call: "📞", email: "✉️", text: "💬", note: "📝",
};

// Touchpoint kinds the driver can log for a prospect stop. Visit is the default.
type TouchKind = "visit" | "call" | "email" | "text";
const TOUCH_KINDS: { id: TouchKind; label: string; icon: string }[] = [
  { id: "visit", label: "Visit", icon: "🚪" },
  { id: "call", label: "Call", icon: "📞" },
  { id: "email", label: "Email", icon: "✉️" },
  { id: "text", label: "Text", icon: "💬" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// Driver-side bottom-sheet contents for a planned prospect visit. Shows the
// touchpoint history + notes, calls Google Voice, and lets the manager log the
// visit with a required note (records a 'visit' touchpoint on the prospect).
export default function ProspectVisitSheet({
  stop,
  expanded,
  onLogged,
}: {
  stop: RouteStop;
  expanded: boolean;
  onLogged: () => void;
}) {
  const pv = stop.prospect_visit!;
  const done = stop.status === "completed";
  const [armed, setArmed] = useState(false);   // slid → showing the detail form
  const [kind, setKind] = useState<TouchKind>("visit");
  const [note, setNote] = useState("");
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  // Offline-first: update the UI now, queue the write (replays in the background
  // when signal returns). Service is unreliable in the field, so logging must
  // never block on or be lost to the network.
  function save() {
    if (!note.trim()) { setError("Add a quick note about the touchpoint."); return; }
    onLogged();
    start(() => runStopAction({ kind: "prospectVisit", stopId: stop.id, visitId: pv.id, prospectId: pv.prospect_id, notes: note, touchType: kind }));
  }

  function skip() {
    onLogged();
    start(() => runStopAction({ kind: "prospectSkip", stopId: stop.id, visitId: pv.id, reason: skipReason }));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{
          width: 36, height: 36, borderRadius: "50%", background: "#d59a29", color: "#1a1a1a",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          fontSize: 16,
        }}>🔔</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "#d59a29", fontWeight: 600 }}>Prospect visit</div>
          <div style={{ fontFamily: "var(--font-serif, 'Cormorant Garamond', serif)", fontSize: 24, fontWeight: 500, color: "#1a1a1a", lineHeight: 1.06, marginTop: 2 }}>{pv.name}</div>
          {pv.address && (
            <div style={{ fontSize: 13.5, color: "rgba(26,26,26,0.5)", marginTop: 2 }}>{pv.address}</div>
          )}
          <div style={{ fontSize: 12, color: "rgba(26,26,26,0.45)", marginTop: 3 }}>
            Last visit: <b style={{ color: "rgba(26,26,26,0.7)" }}>{ago(pv.last_visit_at)}</b>
          </div>
        </div>
      </div>

      {/* ── Action zone: slide to log (→ detail) · caution to skip ── */}
      {done ? (
        <div style={{ marginTop: 14, background: "rgba(2,115,62,0.08)", border: "1px solid rgba(2,115,62,0.3)", borderRadius: 13, padding: "12px 14px" }}>
          <div style={{ fontSize: 13.5, color: "#02733e", fontWeight: 500 }}>
            {stop.status === "skipped" ? "⚠ Skipped" : "✓ Touchpoint logged"}
          </div>
          {stop.notes && <div style={{ fontSize: 13, color: "rgba(26,26,26,0.65)", marginTop: 4, lineHeight: 1.4 }}>{stop.notes}</div>}
        </div>
      ) : skipOpen ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#b8821f", fontWeight: 600, marginBottom: 8 }}>Why couldn&apos;t you do it?</div>
          <textarea
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="No one available, closed, no answer…"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #E1DBCC", background: "#fff", fontSize: 15, color: "#1a1a1a", resize: "none", outline: "none", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={skip} disabled={busy} style={{ flex: 1, minHeight: 56, borderRadius: 16, border: "1px solid #b8821f", background: "#fff", color: "#b8821f", fontSize: 14, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
              {busy ? "Saving…" : "⚠ Mark skipped"}
            </button>
            <button onClick={() => { setSkipOpen(false); setSkipReason(""); setError(""); }} disabled={busy} style={{ minHeight: 56, padding: "0 18px", borderRadius: 16, border: "1px solid #E1DBCC", background: "#fff", color: "rgba(26,26,26,0.55)", fontSize: 12, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>Back</button>
          </div>
          {error && <div style={{ fontSize: 12.5, color: "#dc2626", marginTop: 6 }}>{error}</div>}
        </div>
      ) : !armed ? (
        <div style={{ marginTop: 14 }}>
          <SlideToConfirm label="Slide to log touchpoint" onConfirm={() => setArmed(true)} />
          <button
            onClick={() => setSkipOpen(true)}
            style={{ width: "100%", marginTop: 10, minHeight: 44, borderRadius: 14, border: "1px solid #E1DBCC", background: "#fff", color: "#b8821f", fontSize: 12.5, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            ⚠ Couldn&apos;t reach · skip
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {/* Type selector — default Visit, switch to Call / Email / Text */}
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", fontWeight: 600, marginBottom: 8 }}>What did you do?</div>
          <div style={{ display: "flex", gap: 7, marginBottom: 12, flexWrap: "wrap" }}>
            {TOUCH_KINDS.map((t) => {
              const on = kind === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setKind(t.id)}
                  style={{ flex: "1 1 0", minWidth: 64, minHeight: 46, borderRadius: 12, border: on ? "1.5px solid #02733e" : "1px solid #E1DBCC", background: on ? "rgba(2,115,62,0.08)" : "#fff", color: on ? "#02733e" : "rgba(26,26,26,0.6)", fontSize: 13, fontWeight: on ? 600 : 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                >
                  <span>{t.icon}</span>{t.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            autoFocus
            placeholder="What happened? Who you spoke with, next step…"
            style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: "1px solid #E1DBCC", background: "#fff", fontSize: 15, color: "#1a1a1a", resize: "none", outline: "none", fontFamily: "inherit" }}
          />
          {error && <div style={{ fontSize: 12.5, color: "#dc2626", marginTop: 6 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              onClick={save}
              disabled={busy || !note.trim()}
              style={{ flex: 1, minHeight: 56, borderRadius: 16, border: "none", background: note.trim() && !busy ? "#02733e" : "rgba(26,26,26,0.05)", color: note.trim() && !busy ? "#FAF6EC" : "rgba(26,26,26,0.3)", fontSize: 15, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", cursor: note.trim() && !busy ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              {busy ? "Saving…" : `✓ Log ${TOUCH_KINDS.find((t) => t.id === kind)?.label.toLowerCase()}`}
            </button>
            <button
              onClick={() => { setArmed(false); setNote(""); setError(""); }}
              disabled={busy}
              style={{ minHeight: 56, padding: "0 18px", borderRadius: 16, border: "1px solid #E1DBCC", background: "#fff", color: "rgba(26,26,26,0.55)", fontSize: 12, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Reference info (expand the sheet to see) ── */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: "1px solid #E1DBCC", paddingTop: 14 }}>
          {pv.notes_summary && (
            <div style={{ background: "rgba(213,154,41,0.10)", border: "1px solid rgba(213,154,41,0.32)", borderRadius: 13, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#a37314", fontWeight: 600 }}>Standing notes</div>
              <div style={{ fontSize: 14, color: "#1a1a1a", marginTop: 4, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{pv.notes_summary}</div>
            </div>
          )}

          {pv.phone && (
            <a href={googleVoiceCallHref(pv.phone)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: "1px solid #E1DBCC", borderRadius: 13, padding: "12px 14px", textDecoration: "none", marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>📞</span>
              <span style={{ fontSize: 14.5, color: "#1a1a1a" }}>{pv.phone}</span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.35)" }}>Call</span>
            </a>
          )}

          {/* History */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", fontWeight: 600, marginBottom: 8 }}>Touch history</div>
            {pv.history.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(26,26,26,0.4)" }}>No touches yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflow: "auto" }}>
                {pv.history.slice(0, 10).map((t) => (
                  <div key={t.id} style={{ background: "#fff", border: "1px solid #E1DBCC", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1a1a1a" }}>
                      <span>{ICON[t.type] ?? "•"}</span>
                      <span style={{ textTransform: "capitalize" }}>{t.type}</span>
                      {t.created_by && <span style={{ color: "rgba(26,26,26,0.4)", fontSize: 11 }}>· {t.created_by}</span>}
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(26,26,26,0.4)" }}>{fmt(t.created_at)}</span>
                    </div>
                    {t.note && <div style={{ fontSize: 12.5, color: "rgba(26,26,26,0.65)", marginTop: 3, lineHeight: 1.35 }}>{t.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
