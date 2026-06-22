"use client";

import { useState, useTransition } from "react";
import { completeProspectVisit } from "@/lib/actions/prospectVisits";
import { googleVoiceCallHref } from "@/lib/phone";
import type { RouteStop } from "@/lib/types";

const ICON: Record<string, string> = {
  visit: "🚪", delivery: "🚐", call: "📞", email: "✉️", text: "💬", note: "📝",
};

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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, start] = useTransition();

  function save() {
    if (!note.trim()) { setError("Add a quick note about the visit."); return; }
    setBusy(true);
    setError("");
    start(async () => {
      const res = await completeProspectVisit(pv.id, pv.prospect_id, note);
      setBusy(false);
      if (res.error) { setError(res.error); return; }
      onLogged();
    });
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

          {/* Log visit */}
          {!done ? (
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", fontWeight: 600, marginBottom: 8 }}>
                Log this visit <span style={{ color: "#a37314" }}>· required</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="What happened? Who you spoke with, next step…"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: "1px solid #E1DBCC", background: "#fff", fontSize: 14, color: "#1a1a1a", resize: "none", outline: "none" }}
              />
              {error && <div style={{ fontSize: 12.5, color: "#dc2626", marginTop: 6 }}>{error}</div>}
              <button
                onClick={save}
                disabled={busy || !note.trim()}
                style={{ width: "100%", marginTop: 10, minHeight: 56, borderRadius: 16, border: "none", background: note.trim() && !busy ? "#02733e" : "rgba(26,26,26,0.05)", color: note.trim() && !busy ? "#FAF6EC" : "rgba(26,26,26,0.3)", fontSize: 15, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", cursor: note.trim() && !busy ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
              >
                {busy ? "Saving…" : "✓ Log visit"}
              </button>
            </div>
          ) : (
            <div style={{ background: "rgba(2,115,62,0.08)", border: "1px solid rgba(2,115,62,0.3)", borderRadius: 13, padding: "12px 14px" }}>
              <div style={{ fontSize: 13.5, color: "#02733e", fontWeight: 500 }}>✓ Visit logged</div>
              {stop.notes && <div style={{ fontSize: 13, color: "rgba(26,26,26,0.65)", marginTop: 4, lineHeight: 1.4 }}>{stop.notes}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
