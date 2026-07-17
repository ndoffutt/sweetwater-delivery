"use client";

import {
  useState,
  useRef,
  useEffect,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import { runStopAction, subscribeSync, type SyncState } from "@/lib/offline";
import PhotoCapture from "@/components/PhotoCapture";
import RouteMap from "@/components/RouteMap";
import type { RouteStop } from "@/lib/types";
import { googleVoiceCallHref, formatPhone } from "@/lib/phone";
import ProspectVisitSheet from "@/components/ProspectVisitSheet";

const C = {
  green: "#02733e",
  greenDark: "#015a30",
  gold: "#d59a29",
  goldDark: "#b8821f",
  cream: "#FAF7F2",
  creamDark: "#F0EBE1",
  charcoal: "#1A1A1A",
  serif: '"Cormorant Garamond", Georgia, serif',
  body: '"Jost", system-ui, sans-serif',
};

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/stop-photos/`;

// ── Local route cache (offline reads) ──────────────────────────
// The service worker keeps the app shell openable in a dead zone; this keeps
// the DATA fresh across restarts. Server data can lag behind reality while
// offline writes sit in the queue, so on load we merge: whichever side has a
// stop further along (pending → arrived → completed/skipped) wins.
const ROUTE_CACHE_KEY = "sw-route-cache";
const CACHE_TTL_MS = 18 * 60 * 60 * 1000; // one route day

const statusRank: Record<string, number> = { pending: 0, arrived: 1, completed: 2, skipped: 2 };

function saveRouteCache(stops: RouteStop[]) {
  try {
    localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), stops }));
  } catch { /* storage full - cache is best-effort */ }
}

function mergeWithCache(initial: RouteStop[]): RouteStop[] {
  try {
    const raw = localStorage.getItem(ROUTE_CACHE_KEY);
    if (!raw) return initial;
    const { savedAt, stops } = JSON.parse(raw) as { savedAt: number; stops: RouteStop[] };
    if (Date.now() - savedAt > CACHE_TTL_MS) return initial;
    const cached = new Map(stops.map((s) => [s.id, s]));
    return initial.map((s) => {
      const c = cached.get(s.id);
      if (!c) return s;
      if ((statusRank[c.status] ?? 0) > (statusRank[s.status] ?? 0)) {
        return { ...s, status: c.status, arrived_at: c.arrived_at ?? s.arrived_at, completed_at: c.completed_at ?? s.completed_at, dropoff_confirmed: c.dropoff_confirmed || s.dropoff_confirmed, pickup_confirmed: c.pickup_confirmed || s.pickup_confirmed };
      }
      return s;
    });
  } catch {
    return initial;
  }
}

// ── Icons ──────────────────────────────────────────────────────
type IconName =
  | "nav" | "route" | "chevron" | "check" | "key" | "phone"
  | "camera" | "arrowUp" | "arrowDown" | "alert" | "cloud" | "cloudCheck" | "x" | "chat";

function Icon({
  name, size = 22, color = "currentColor", strokeWidth = 2, style,
}: { name: IconName; size?: number; color?: string; strokeWidth?: number; style?: CSSProperties }) {
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    nav: <path {...p} d="M21 4L3 11l7 2.5L12.5 21 21 4z" />,
    route: <g {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H14a3 3 0 000-6H9a3 3 0 010-6h6.5" /></g>,
    chevron: <path {...p} d="M9 5l7 7-7 7" />,
    check: <path {...p} d="M4 12.5l5 5L20 6.5" />,
    key: <g {...p}><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M18 18l2-2" /></g>,
    phone: <path {...p} d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 013.5 5.6 1.5 1.5 0 015 4z" />,
    camera: <g {...p}><path d="M3 8a2 2 0 012-2h2l1.2-1.8A2 2 0 0110 3.5h4a2 2 0 011.7 1L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><circle cx="12" cy="12.5" r="3.3" /></g>,
    arrowUp: <path {...p} d="M12 19V5M6 11l6-6 6 6" />,
    arrowDown: <path {...p} d="M12 5v14M6 13l6 6 6-6" />,
    alert: <g {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.4" fill={color} /></g>,
    cloud: <path {...p} d="M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.4A3.8 3.8 0 0118 18H7z" />,
    cloudCheck: <g {...p}><path d="M7 17a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.4A3.8 3.8 0 0117.5 17" /><path d="M9 16.5l2 2 4-4" /></g>,
    x: <path {...p} d="M6 6l12 12M18 6L6 18" />,
    chat: <g {...p}><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4.5 3.5V17H4a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 9.5h8M8 12.5h5" /></g>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }}>
      {paths[name]}
    </svg>
  );
}

// ── Slide to arrive ────────────────────────────────────────────
function SlideToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
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
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.body, fontSize: 14.5, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.green, opacity: 1 - pct * 1.2 }}>
        {done ? "" : label}
      </div>
      <div onMouseDown={(e) => down(e.clientX)} onTouchStart={(e) => down(e.touches[0].clientX)}
        style={{ position: "absolute", top: 3, left: 3, width: knob, height: 52, borderRadius: 13, background: C.green, transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform .2s", display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", boxShadow: "0 3px 10px rgba(2,115,62,0.35)" }}>
        <Icon name={done ? "check" : "chevron"} size={24} color={C.cream} strokeWidth={2.6} />
      </div>
    </div>
  );
}

// ── Primitives ─────────────────────────────────────────────────
function Label({ children, color }: { children: React.ReactNode; color?: string }) {
  return <div style={{ fontFamily: C.body, fontSize: 11, fontWeight: 500, letterSpacing: "0.22em", textTransform: "uppercase", color: color || "rgba(26,26,26,0.45)" }}>{children}</div>;
}

function NumBadge({ n, active, done }: { n: number; active?: boolean; done?: boolean }) {
  return (
    <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.body, fontSize: 16, fontWeight: 600, background: done || active ? C.green : C.creamDark, color: done || active ? C.cream : "rgba(26,26,26,0.5)" }}>
      {done ? <Icon name="check" size={20} color={C.cream} strokeWidth={2.6} /> : n}
    </div>
  );
}

function TaskChip({ type }: { type: "drop" | "pick" }) {
  const drop = type === "drop";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", background: drop ? "rgba(2,115,62,0.08)" : "rgba(213,154,41,0.14)", color: drop ? C.green : C.goldDark, borderRadius: 8, padding: "4px 9px", fontFamily: C.body, fontSize: 12.5, fontWeight: 500 }}>
      <Icon name={drop ? "arrowDown" : "arrowUp"} size={14} /> {drop ? "Drop-off" : "Pick-up"}
    </span>
  );
}

function CheckRow({ label, icon, checked, onClick }: { label: string; icon: IconName; checked: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: checked ? C.green : "#fff", border: `2px solid ${checked ? C.green : C.creamDark}`, borderRadius: 16, padding: "18px 18px", minHeight: 64, transition: "all .15s", boxShadow: checked ? "0 3px 10px rgba(2,115,62,0.25)" : "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: checked ? "rgba(255,255,255,0.22)" : "transparent", border: checked ? "none" : "2.5px solid rgba(26,26,26,0.22)" }}>
        {checked && <Icon name="check" size={20} color={C.cream} strokeWidth={3} />}
      </div>
      <Icon name={icon} size={21} color={checked ? C.cream : "rgba(26,26,26,0.4)"} />
      <div style={{ fontFamily: C.body, fontSize: 16.5, fontWeight: checked ? 600 : 500, color: checked ? C.cream : C.charcoal }}>{label}</div>
    </button>
  );
}

// ── Sheets ─────────────────────────────────────────────────────
function BottomShell({ children, onGrip, expanded }: { children: React.ReactNode; onGrip?: () => void; expanded?: boolean }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 12, background: C.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: "0 -10px 40px rgba(0,0,0,0.16)", padding: "8px 18px 34px", maxHeight: expanded ? "84%" : "auto", overflow: expanded ? "auto" : "visible", transition: "max-height .25s" }}>
      <button onClick={onGrip} disabled={!onGrip} style={{ display: "block", width: "100%", background: "none", border: "none", cursor: onGrip ? "pointer" : "default", padding: "4px 0 10px" }}>
        <div style={{ width: 42, height: 5, borderRadius: 999, background: C.creamDark, margin: "0 auto" }} />
      </button>
      {children}
    </div>
  );
}

function OverviewSheet({ stops, targetId, isManager, onPick, onClose, onBack, onSignOut }: { stops: RouteStop[]; targetId: string; isManager: boolean; onPick: (id: string) => void; onClose: () => void; onBack: () => void; onSignOut: () => void }) {
  const statusText: Record<string, string> = { pending: "", arrived: "On site", completed: "Done", skipped: "Flagged" };
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.4)" }} />
      <div style={{ position: "relative", background: C.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: "10px 16px 30px", maxHeight: "82%", overflow: "auto" }}>
        <div style={{ width: 42, height: 5, borderRadius: 999, background: C.creamDark, margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 500, color: C.charcoal }}>Today&apos;s Route</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Icon name="x" size={20} color="rgba(26,26,26,0.4)" /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stops.map((s) => {
            const sel = s.id === targetId;
            const st = statusText[s.status];
            return (
              <button key={s.id} onClick={() => onPick(s.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: sel ? "rgba(2,115,62,0.07)" : "#fff", border: `1px solid ${sel ? "rgba(2,115,62,0.3)" : C.creamDark}`, borderRadius: 13, padding: "11px 13px" }}>
                <NumBadge n={s.stop_order} done={s.status === "completed"} active={sel} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: C.body, fontSize: 15, fontWeight: 500, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: s.status === "completed" ? 0.6 : 1 }}>{s.customer?.name}</div>
                  <div style={{ fontFamily: C.body, fontSize: 12, color: "rgba(26,26,26,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.customer?.address}</div>
                </div>
                {st ? (
                  <span style={{ flexShrink: 0, fontFamily: C.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: s.status === "completed" ? C.green : s.status === "skipped" ? C.goldDark : C.gold }}>{st}</span>
                ) : (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {s.has_dropoff && <Icon name="arrowDown" size={15} color="rgba(2,115,62,0.6)" />}
                    {s.has_pickup && <Icon name="arrowUp" size={15} color="rgba(213,154,41,0.85)" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.creamDark}` }}>
          {isManager && (
            <button onClick={onBack} style={{ flex: 1, background: "#fff", border: `1px solid ${C.creamDark}`, borderRadius: 13, padding: "12px", cursor: "pointer", fontFamily: C.body, fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.charcoal }}>← Dispatch</button>
          )}
          <button onClick={onSignOut} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", fontFamily: C.body, fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", padding: "12px" }}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

function ProblemSheet({ name, progress, onClose, onResolve }: { name: string; progress?: string | null; onClose: () => void; onResolve: (reason: string) => void }) {
  const reasons = ["Gate code didn't work", "Nobody home", "Couldn't access property", "Wrong address", "Other issue"];
  // "Other issue" requires the driver to say WHAT happened - a bare "Other"
  // tells dispatch nothing when they follow up with the customer.
  const [other, setOther] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.4)" }} />
      <div style={{ position: "relative", background: C.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: "10px 16px 34px" }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: C.creamDark, margin: "0 auto 14px" }} />
        <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 500, color: C.charcoal }}>{other ? "What's the issue?" : "What happened?"}</div>
        <div style={{ fontFamily: C.body, fontSize: 13.5, color: "rgba(26,26,26,0.5)", marginTop: 3, marginBottom: 16 }}>
          {other ? `Tell dispatch what's going on at ${name}'s stop.` : `Dispatch will be notified and ${name}'s stop flagged.`}
        </div>
        {/* The driver already did work here — a skip would contradict it (this
            exact mixup produced "skipped" stops with confirmed pickups). */}
        {progress && !other && (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(213,154,41,0.12)", border: `1px solid rgba(213,154,41,0.45)`, borderRadius: 13, padding: "12px 14px", marginBottom: 14 }}>
            <Icon name="alert" size={19} color={C.goldDark} />
            <div style={{ fontFamily: C.body, fontSize: 13.5, color: C.charcoal, lineHeight: 1.45 }}>
              You&apos;ve already logged work here: <b>{progress}</b>. If the stop is done, go back and tap <b>Complete Stop</b> — only flag it if something actually went wrong.
            </div>
          </div>
        )}
        {other ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Construction blocking the driveway, items missing from the van…"
              style={{ width: "100%", boxSizing: "border-box", background: "#fff", border: `1px solid ${C.creamDark}`, borderRadius: 14, padding: "13px 14px", fontFamily: C.body, fontSize: 15.5, color: C.charcoal, resize: "none", outline: "none" }}
            />
            <button
              onClick={() => note.trim() && onResolve(`Other: ${note.trim()}`)}
              disabled={!note.trim()}
              style={{ width: "100%", minHeight: 54, borderRadius: 14, border: "none", cursor: note.trim() ? "pointer" : "default", background: note.trim() ? C.green : "rgba(26,26,26,0.08)", color: note.trim() ? C.cream : "rgba(26,26,26,0.3)", fontFamily: C.body, fontSize: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              Flag stop
            </button>
            <button onClick={() => { setOther(false); setNote(""); }} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: C.body, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", padding: 8 }}>← Back</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {reasons.map((r) => (
              <button key={r} onClick={() => (r === "Other issue" ? setOther(true) : onResolve(r))} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "#fff", border: `1px solid ${C.creamDark}`, borderRadius: 14, padding: "15px 16px", fontFamily: C.body, fontSize: 15.5, color: C.charcoal, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {r} <Icon name="chevron" size={16} color="rgba(26,26,26,0.3)" />
              </button>
            ))}
          </div>
        )}
        {!other && (
          <button onClick={onClose} style={{ width: "100%", marginTop: 12, background: "none", border: "none", cursor: "pointer", fontFamily: C.body, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)", padding: 10 }}>Cancel</button>
        )}
      </div>
    </div>
  );
}

function Toast({ toast }: { toast: string | null }) {
  return (
    <div style={{ position: "absolute", top: 62, left: 16, right: 16, zIndex: 90, display: "flex", justifyContent: "center", pointerEvents: "none", transition: "opacity .25s, transform .25s", opacity: toast ? 1 : 0, transform: toast ? "translateY(0)" : "translateY(-8px)" }}>
      {toast && <div style={{ background: C.charcoal, color: C.cream, borderRadius: 14, padding: "11px 18px", fontFamily: C.body, fontSize: 13.5, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", textAlign: "center" }}>{toast}</div>}
    </div>
  );
}

const firstName = (n: string) => n.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "").split(/[\s/]/)[0];

function mapsHref(c: { address: string; lat: number | null; lng: number | null }) {
  const dest = c.lat != null && c.lng != null ? `${c.lat},${c.lng}` : encodeURIComponent(c.address);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

// ── Main ───────────────────────────────────────────────────────
export default function DriverMap({ initialStops, isManager, canMessage = false, routeId }: { initialStops: RouteStop[]; isManager: boolean; canMessage?: boolean; routeId: string }) {
  const [stops, setStops] = useState(initialStops);
  const [targetId, setTargetId] = useState(() => (initialStops.find((s) => s.status === "pending" || s.status === "arrived") ?? initialStops[0])?.id ?? "");
  // Prospect stops open expanded so the standing notes + touch history are
  // visible by default (the driver wants context before logging a touchpoint);
  // delivery stops open peeked.
  const [sheet, setSheet] = useState<"peek" | "full">(() => {
    const t = (initialStops.find((s) => s.status === "pending" || s.status === "arrived") ?? initialStops[0]);
    return t?.kind === "prospect_visit" ? "full" : "peek";
  });
  const [overview, setOverview] = useState(false);
  const [problemFor, setProblemFor] = useState<RouteStop | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // Optimistic per-kind photo counts (a shot counts the moment it's taken).
  const [photoBump, setPhotoBump] = useState<Record<string, { dropoff: number; pickup: number }>>({});
  const [sync, setSync] = useState<SyncState>({ pendingPhotos: 0, pendingActions: 0, syncing: false });
  const [, startTransition] = useTransition();
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Merge the local cache after mount (not during render - hydration safety):
  // a restart in a dead zone reopens exactly where the driver left off, even
  // with offline completions still waiting in the sync queue.
  useEffect(() => setStops(mergeWithCache(initialStops)), [initialStops]);
  // Write-through: every local change survives a restart.
  useEffect(() => { if (stops.length) saveRouteCache(stops); }, [stops]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  // Background sync state: pending photo uploads + queued status changes.
  useEffect(() => subscribeSync((s) => setSync(s)), []);
  // Net-failure safety net. The optimistic patch + offline queue already cover
  // the user's intent, so any RSC refetch / fetch that loses signal mid-flight
  // should never blow up the driver view. Captive-portal Wi-Fi reports
  // navigator.onLine=true while every fetch hangs/fails, which is the case
  // that previously crashed the screen mid-swipe.
  useEffect(() => {
    const swallow = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message ?? e.reason ?? "");
      if (/fetch|network|abort|load failed|nettype|err_/i.test(msg)) e.preventDefault();
    };
    window.addEventListener("unhandledrejection", swallow);
    return () => window.removeEventListener("unhandledrejection", swallow);
  }, []);

  // Wrap router.refresh — when offline-but-think-online, the deferred RSC fetch
  // fails async and unmounts the tree. The optimistic patch + cache covers the
  // UI; refreshing is best-effort only.
  function safeRefresh() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try { router.refresh(); } catch { /* offline / RSC fetch failed */ }
  }

  function flash(msg: string) { setToast(msg); if (tt.current) clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 2600); }
  function patch(id: string, f: Partial<RouteStop>) { setStops((arr) => arr.map((s) => (s.id === id ? { ...s, ...f } : s))); }

  const remaining = stops.filter((s) => s.status === "pending" || s.status === "arrived");
  const finished = stops.filter((s) => s.status === "completed" || s.status === "skipped");
  const target = stops.find((s) => s.id === targetId) || remaining[0];
  const allDone = remaining.length === 0;

  // The "Route Complete" screen sticks around all day (the completed route keeps
  // loading) until the driver taps Done — then we remember the dismissal locally
  // so reopening the app doesn't shove it back in their face.
  const DONE_KEY = `sw-route-done-${routeId}`;
  const [routeDismissed, setRouteDismissed] = useState(false);
  useEffect(() => {
    try { setRouteDismissed(localStorage.getItem(DONE_KEY) === "1"); } catch {}
  }, [DONE_KEY]);
  function markRouteDone() {
    try { localStorage.setItem(DONE_KEY, "1"); } catch {}
    setRouteDismissed(true);
    // No auto-push to dispatch — the manager lands on the calm "All done for
    // today" card and taps its own "Back to Dispatch" when ready. Bouncing them
    // out immediately felt too abrupt.
  }
  const photoCount = (s: RouteStop) =>
    (s.photos?.length ?? 0) + (photoBump[s.id]?.dropoff ?? 0) + (photoBump[s.id]?.pickup ?? 0);
  // Per-service proof. Legacy photos (kind null, taken before the photo_kinds
  // migration) count as wildcard so a mid-transition stop can still complete.
  const kindPhotos = (s: RouteStop, k: "dropoff" | "pickup") =>
    (s.photos ?? []).filter((p) => p.kind === k || p.kind == null).length + (photoBump[s.id]?.[k] ?? 0);
  const bumpPhoto = (stopId: string, k: "dropoff" | "pickup") =>
    setPhotoBump((b) => {
      const cur = b[stopId] ?? { dropoff: 0, pickup: 0 };
      return { ...b, [stopId]: { ...cur, [k]: cur[k] + 1 } };
    });

  function selectPin(id: string) {
    setTargetId(id);
    // Prospect stops open expanded (notes + history in view); deliveries peek.
    setSheet(stops.find((s) => s.id === id)?.kind === "prospect_visit" ? "full" : "peek");
  }

  function arrive(s: RouteStop) {
    patch(s.id, { status: "arrived", arrived_at: new Date().toISOString() });
    setSheet("full");
    flash(online ? `✓ Texted ${firstName(s.customer!.name)}: “On our way”` : "Saved on phone, will sync when signal returns");
    startTransition(async () => {
      await runStopAction({ kind: "status", stopId: s.id, status: "arrived" });
      // Only refetch when online — an RSC refresh with no signal throws and
      // blanks the driver view. Offline, the optimistic UI + replay queue cover it.
      safeRefresh();
    });
  }

  function complete(s: RouteStop) {
    patch(s.id, { status: "completed", completed_at: new Date().toISOString() });
    const next = stops.find((x) => x.status === "pending" && x.id !== s.id);
    setTargetId(next ? next.id : s.id);
    setSheet("peek");
    flash(online ? `✓ Delivered, ${firstName(s.customer!.name)} notified` : "Saved on phone, will sync when signal returns");
    startTransition(async () => {
      await runStopAction({ kind: "status", stopId: s.id, status: "completed" });
      safeRefresh();
    });
  }

  function toggleDrop(s: RouteStop) {
    const v = !s.dropoff_confirmed;
    // Confirming a drop-off cancels "nothing to drop off" — they can't both be true.
    patch(s.id, { dropoff_confirmed: v, ...(v ? { dropoff_none: false } : {}) });
    startTransition(async () => {
      if (v && s.dropoff_none) await runStopAction({ kind: "dropoffNone", stopId: s.id, none: false });
      await runStopAction({ kind: "dropoff", stopId: s.id, confirmed: v });
    });
  }
  function toggleNothingToDrop(s: RouteStop) {
    const v = !s.dropoff_none;
    patch(s.id, { dropoff_none: v, ...(v ? { dropoff_confirmed: false } : {}) });
    startTransition(async () => { await runStopAction({ kind: "dropoffNone", stopId: s.id, none: v }); });
  }
  function togglePick(s: RouteStop) {
    const v = !s.pickup_confirmed;
    // Confirming a pick-up cancels "nothing was out" — they can't both be true.
    patch(s.id, { pickup_confirmed: v, ...(v ? { pickup_none: false } : {}) });
    startTransition(async () => {
      if (v && s.pickup_none) await runStopAction({ kind: "pickupNone", stopId: s.id, none: false });
      await runStopAction({ kind: "pickup", stopId: s.id, confirmed: v });
    });
  }
  function toggleNothingOut(s: RouteStop) {
    const v = !s.pickup_none;
    patch(s.id, { pickup_none: v, ...(v ? { pickup_confirmed: false } : {}) });
    startTransition(async () => { await runStopAction({ kind: "pickupNone", stopId: s.id, none: v }); });
  }

  function resolveProblem(reason: string) {
    if (!problemFor) return;
    const s = problemFor;
    patch(s.id, { status: "skipped", notes: reason });
    const next = stops.find((x) => x.status === "pending" && x.id !== s.id);
    if (next) setTargetId(next.id);
    setProblemFor(null);
    setSheet("peek");
    flash("Dispatch notified");
    startTransition(async () => {
      await runStopAction({ kind: "flag", stopId: s.id, reason });
      safeRefresh();
    });
  }

  const cust = target?.customer;
  // Each service the stop calls for (or the driver started) must be finished
  // AND proven with its own photo before the stop can complete.
  //
  // The pick-up question must be answered at EVERY stop: planned pick-ups are
  // confirmed + photographed (or excused with "nothing was out"), and drop-off
  // stops without a planned pick-up ask "Is there a pickup?" — Yes means
  // confirm + photo, No records that the driver checked. Unplanned pick-ups
  // (a bag left out) were getting missed because nobody asked.
  const dropNeeded = !!target && (target.has_dropoff || target.dropoff_confirmed);
  // Drop-off resolves the same way pick-up does: excused with "nothing to drop
  // off", or confirmed + photographed. A pickup-only visit at a drop-off stop
  // (which happens) can now finish without faking a drop-off or skipping.
  const dropOK =
    !dropNeeded ||
    (!!target?.dropoff_none
      ? true
      : !!target?.dropoff_confirmed
      ? kindPhotos(target!, "dropoff") > 0
      : false);
  const pickResolved =
    !!target &&
    (target.pickup_none
      ? true
      : target.pickup_confirmed
      ? kindPhotos(target, "pickup") > 0
      : false);
  const didSomething = !!target && (target.dropoff_confirmed || target.pickup_confirmed || !!target.pickup_none || !!target.dropoff_none);
  const canComplete = !!target && dropOK && pickResolved && didSomething;
  const completeHint = !target
    ? ""
    : !dropOK
    ? target.dropoff_confirmed ? "Add a drop-off photo to finish" : "Confirm the drop-off — or mark “nothing to drop off”"
    : !pickResolved
    ? target.pickup_confirmed
      ? "Add a pick-up photo to finish"
      : target.has_pickup
      ? "Confirm the pick-up — or mark “nothing was out”"
      : "Is there a pickup? Answer Yes or No"
    : !didSomething
    ? "Confirm what you did at this stop"
    : "";
  const dropPhotos = target ? (target.photos ?? []).filter((p) => p.kind === "dropoff" || p.kind == null).map((p) => ({ id: p.id, url: STORAGE_BASE + p.storage_path })) : [];
  const pickPhotos = target ? (target.photos ?? []).filter((p) => p.kind === "pickup").map((p) => ({ id: p.id, url: STORAGE_BASE + p.storage_path })) : [];

  // After the driver taps Done on a finished route, show a calm end-of-day card
  // instead of the map for the rest of the day.
  if (allDone && routeDismissed) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#EAE6DC", fontFamily: C.body, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(2,115,62,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><Icon name="check" size={42} color={C.green} strokeWidth={2.4} /></div>
          <div style={{ fontFamily: C.serif, fontSize: 30, color: C.green, fontWeight: 500 }}>All done for today</div>
          <div style={{ fontSize: 14.5, color: "rgba(26,26,26,0.55)", marginTop: 6, lineHeight: 1.5 }}>Nice work — every stop on today&apos;s route is complete.</div>
          {isManager && (
            <button onClick={() => router.push("/dispatch")} style={{ marginTop: 20, minHeight: 52, padding: "0 28px", borderRadius: 16, background: C.green, color: C.cream, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>Back to Dispatch</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden", background: "#EAE6DC", fontFamily: C.body }}>
      {/* MAP */}
      <RouteMap stops={stops} targetId={targetId} onSelect={selectPin} />

      {/* TOP CHROME */}
      <div style={{ position: "absolute", top: 14, left: 16, right: 16, zIndex: 10, display: "flex", alignItems: "stretch", gap: 8 }}>
        <button onClick={() => setOverview(true)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 16, padding: "11px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", border: "none", cursor: "pointer", textAlign: "left" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="route" size={20} color={C.cream} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.charcoal }}>{allDone ? "Route complete" : `${remaining.length} stop${remaining.length === 1 ? "" : "s"} left`}</div>
            <div style={{ height: 5, background: "rgba(26,26,26,0.1)", borderRadius: 999, marginTop: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${stops.length ? (finished.length / stops.length) * 100 : 0}%`, background: C.green, borderRadius: 999 }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>{finished.length}/{stops.length}</span>
            <Icon name="chevron" size={14} color="rgba(26,26,26,0.35)" style={{ transform: "rotate(90deg)" }} />
          </div>
        </button>
        {isManager && (
          <button onClick={() => router.push("/dispatch")} title="Back to Dispatch" style={{ flexShrink: 0, width: 50, borderRadius: 16, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="route" size={20} color={C.green} />
        </button>
        )}
        {canMessage && (
          <button onClick={() => router.push("/driver/messages")} title="Messages" style={{ flexShrink: 0, width: 50, borderRadius: 16, background: "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="chat" size={20} color={C.green} />
          </button>
        )}
        {(() => {
          const pending = sync.pendingPhotos + sync.pendingActions;
          const title = !online
            ? `Offline · ${pending} change${pending === 1 ? "" : "s"} saved on phone`
            : pending > 0
            ? `Syncing ${pending} in background`
            : "Online · all synced";
          return (
            <div title={title} style={{ flexShrink: 0, minWidth: 50, padding: pending > 0 ? "0 12px" : 0, borderRadius: 16, background: online ? "rgba(255,255,255,0.86)" : "rgba(213,154,41,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name={online && pending === 0 ? "cloudCheck" : "cloud"} size={20} color={online ? (pending > 0 ? C.goldDark : C.green) : "#fff"} />
              {pending > 0 && (
                <span style={{ fontFamily: C.body, fontSize: 12.5, fontWeight: 600, color: online ? C.goldDark : "#fff" }}>{pending}</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* PHOTO-UPLOAD WARNING — proof photos upload separately from the (tiny)
          status updates and can lag on weak signal. Make it loud so the driver
          keeps the app open on Wi-Fi and the proof isn't left stranded. */}
      {sync.pendingPhotos > 0 && (
        <div style={{ position: "absolute", top: 78, left: 16, right: 16, zIndex: 11, display: "flex", alignItems: "center", gap: 10, background: "rgba(213,154,41,0.96)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 14, padding: "11px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
          <Icon name="cloud" size={20} color="#fff" />
          <div style={{ flex: 1, fontFamily: C.body, fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.35 }}>
            {sync.pendingPhotos} photo{sync.pendingPhotos === 1 ? "" : "s"} still uploading — keep this app open{online ? " on Wi-Fi" : " and get back on signal"} until it finishes.
          </div>
        </div>
      )}

      {/* RECENTER */}
      {!allDone && (
        <button onClick={() => flash("Re-centered on you")} style={{ position: "absolute", right: 16, bottom: sheet === "full" ? "auto" : 310, top: sheet === "full" ? 72 : "auto", zIndex: 9, width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", boxShadow: "0 4px 14px rgba(0,0,0,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="nav" size={20} color="#2a7de1" />
        </button>
      )}

      {/* BOTTOM SHEET */}
      {allDone ? (
        <BottomShell>
          <div style={{ textAlign: "center", padding: "6px 0 8px" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(2,115,62,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><Icon name="check" size={38} color={C.green} strokeWidth={2.4} /></div>
            <div style={{ fontFamily: C.serif, fontSize: 28, color: C.green, fontWeight: 500 }}>Route Complete</div>
            <div style={{ fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 3 }}>All {stops.length} stops done. Head back to the shop.</div>
            {sync.pendingPhotos > 0 && (
              <div style={{ marginTop: 14, background: "rgba(213,154,41,0.14)", border: "1px solid rgba(213,154,41,0.5)", borderRadius: 13, padding: "12px 14px", textAlign: "left", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Icon name="cloud" size={19} color={C.goldDark} />
                <div style={{ fontFamily: C.body, fontSize: 13, color: C.charcoal, lineHeight: 1.4 }}>
                  <b>{sync.pendingPhotos} photo{sync.pendingPhotos === 1 ? "" : "s"} haven&apos;t uploaded yet.</b> Keep the app open{online ? " on Wi-Fi" : " and get back on signal"} until this clears, or the proof may be lost.
                </div>
              </div>
            )}
            <button
              onClick={() => {
                if (sync.pendingPhotos > 0 && !window.confirm(`${sync.pendingPhotos} photo${sync.pendingPhotos === 1 ? "" : "s"} still haven't uploaded and may be lost if you close now. Close anyway?`)) return;
                markRouteDone();
              }}
              style={{ marginTop: 18, width: "100%", minHeight: 56, borderRadius: 16, background: sync.pendingPhotos > 0 ? C.goldDark : C.green, color: C.cream, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase" }}
            >
              {sync.pendingPhotos > 0 ? "Waiting on photos…" : "Done"}
            </button>
          </div>
        </BottomShell>
      ) : target && target.kind === "prospect_visit" && target.prospect_visit ? (
        <BottomShell onGrip={() => setSheet(sheet === "peek" ? "full" : "peek")} expanded={sheet === "full"}>
          <ProspectVisitSheet
            // Remount per stop so the note box never carries a prior prospect's text.
            key={target.id}
            stop={target}
            expanded={sheet === "full"}
            onLogged={(outcome) => {
              patch(target.id, { status: outcome === "skipped" ? "skipped" : "completed", completed_at: new Date().toISOString() });
              // Auto-advance to the next unfinished stop, just like a delivery.
              const next = stops.find((x) => (x.status === "pending" || x.status === "arrived") && x.id !== target.id);
              setTargetId(next ? next.id : target.id);
              flash(outcome === "skipped" ? "Visit skipped — dispatch notified" : "Touchpoint logged");
              // Keep a prospect next-stop expanded (notes + history in view).
              setSheet(next?.kind === "prospect_visit" ? "full" : "peek");
              // NB: no safeRefresh() here — the sheet calls onSynced after the write
              // lands so we don't refetch stale "planned" data and undo the advance.
            }}
            onSynced={safeRefresh}
          />
        </BottomShell>
      ) : target && cust && (
        <BottomShell onGrip={() => setSheet(sheet === "peek" ? "full" : "peek")} expanded={sheet === "full"}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <NumBadge n={target.stop_order} active />
            <div style={{ flex: 1, minWidth: 0 }}>
              {isManager ? (
                <a href={`/dispatch/customers?id=${cust.id}`} style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 500, color: C.charcoal, lineHeight: 1.06, textDecoration: "none" }}>
                  {cust.name} ›
                </a>
              ) : (
                <div style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 500, color: C.charcoal, lineHeight: 1.06 }}>{cust.name}</div>
              )}
              <div style={{ fontSize: 13.5, color: "rgba(26,26,26,0.5)", marginTop: 2 }}>{cust.address}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
            {target.has_dropoff && <TaskChip type="drop" />}
            {target.has_pickup && <TaskChip type="pick" />}
            {cust.gate_code && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", background: "rgba(213,154,41,0.14)", color: C.goldDark, borderRadius: 8, padding: "4px 9px", fontSize: 12.5, fontWeight: 500 }}>
                <Icon name="key" size={14} /> {cust.gate_code}
              </span>
            )}
          </div>

          {sheet === "full" && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${C.creamDark}`, paddingTop: 14 }}>
              {cust.delivery_notes && (
                <div style={{ background: "rgba(2,115,62,0.05)", border: "1px solid rgba(2,115,62,0.18)", borderRadius: 13, padding: "12px 14px", marginBottom: 12 }}>
                  <Label color={C.green}>Delivery Notes</Label>
                  <div style={{ fontSize: 14.5, color: C.charcoal, marginTop: 4, lineHeight: 1.45 }}>{cust.delivery_notes}</div>
                </div>
              )}
              {cust.phone && (
                <a href={googleVoiceCallHref(cust.phone)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: `1px solid ${C.creamDark}`, borderRadius: 13, padding: "12px 14px", textDecoration: "none", marginBottom: 12 }}>
                  <Icon name="phone" size={19} color={C.green} />
                  <span style={{ fontSize: 14.5, color: C.charcoal }}>{formatPhone(cust.phone)}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.35)" }}>Call</span>
                </a>
              )}

              {target.status === "arrived" && (
                <>
                  {/* ── Drop-off: confirm + photo, or "nothing to drop off"
                      (pickup-only visit at a drop-off stop). ── */}
                  {(target.has_dropoff || target.dropoff_confirmed || target.dropoff_none) ? (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ marginBottom: 9, marginLeft: 2 }}>
                        <Label>Drop-off <span style={{ color: dropOK ? C.green : C.goldDark }}>{target.dropoff_none ? "· nothing to drop off" : "· photo required"}</span></Label>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        <CheckRow label="Dropped off" icon="arrowDown" checked={target.dropoff_confirmed} onClick={() => toggleDrop(target)} />
                        {!target.dropoff_confirmed && (
                          <button onClick={() => toggleNothingToDrop(target)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: target.dropoff_none ? C.goldDark : "#fff", border: `2px solid ${target.dropoff_none ? C.goldDark : C.creamDark}`, borderRadius: 16, padding: "18px 18px", minHeight: 64, boxShadow: target.dropoff_none ? "0 3px 10px rgba(184,130,31,0.25)" : "0 1px 3px rgba(0,0,0,0.05)" }}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: target.dropoff_none ? "rgba(255,255,255,0.25)" : "transparent", border: target.dropoff_none ? "none" : "2.5px solid rgba(26,26,26,0.22)" }}>
                              {target.dropoff_none && <Icon name="check" size={20} color="#fff" strokeWidth={3} />}
                            </div>
                            <div style={{ fontFamily: C.body, fontSize: 16.5, fontWeight: target.dropoff_none ? 600 : 500, color: target.dropoff_none ? "#fff" : C.charcoal }}>Nothing to drop off</div>
                          </button>
                        )}
                        {!target.dropoff_none && (
                          <PhotoCapture
                            stopId={target.id}
                            kind="dropoff"
                            title="Drop-off photo"
                            existingPhotos={dropPhotos}
                            onPhotoAdded={() => bumpPhoto(target.id, "dropoff")}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => toggleDrop(target)} style={{ width: "100%", marginBottom: 14, background: "none", border: `1px dashed ${C.creamDark}`, borderRadius: 12, cursor: "pointer", padding: "10px", fontFamily: C.body, fontSize: 13, color: "rgba(26,26,26,0.45)" }}>
                      + Also dropped something off?
                    </button>
                  )}

                  {/* ── Pick-up. Planned: confirm + photo (or "nothing was out").
                      Not planned: mandatory "Is there a pickup?" — unplanned
                      pick-ups get missed unless the driver is asked outright. ── */}
                  {!target.has_pickup && !target.pickup_confirmed && !target.pickup_none ? (
                    <div style={{ background: "rgba(213,154,41,0.1)", border: `1.5px solid ${C.goldDark}`, borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ fontFamily: C.body, fontSize: 15.5, fontWeight: 600, color: C.charcoal }}>Is there a pickup?</div>
                      <div style={{ fontFamily: C.body, fontSize: 12.5, color: "rgba(26,26,26,0.5)", marginTop: 2 }}>Check for a bag before you leave — even if none was scheduled.</div>
                      <div style={{ display: "flex", gap: 9, marginTop: 11 }}>
                        <button onClick={() => togglePick(target)} style={{ flex: 1, minHeight: 50, borderRadius: 13, border: `1.5px solid ${C.green}`, background: "#fff", color: C.green, cursor: "pointer", fontFamily: C.body, fontSize: 14, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                          Yes — picked up
                        </button>
                        <button onClick={() => toggleNothingOut(target)} style={{ flex: 1, minHeight: 50, borderRadius: 13, border: `1px solid ${C.creamDark}`, background: "#fff", color: "rgba(26,26,26,0.6)", cursor: "pointer", fontFamily: C.body, fontSize: 14, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                          No pickup
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ marginBottom: 9, marginLeft: 2 }}>
                        <Label>Pick-up <span style={{ color: pickResolved ? C.green : C.goldDark }}>{target.pickup_none ? "· nothing was out" : "· photo required"}</span></Label>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        <CheckRow label="Picked up" icon="arrowUp" checked={target.pickup_confirmed} onClick={() => togglePick(target)} />
                        {!target.pickup_confirmed && (
                          <button onClick={() => toggleNothingOut(target)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: target.pickup_none ? C.goldDark : "#fff", border: `2px solid ${target.pickup_none ? C.goldDark : C.creamDark}`, borderRadius: 16, padding: "18px 18px", minHeight: 64, boxShadow: target.pickup_none ? "0 3px 10px rgba(184,130,31,0.25)" : "0 1px 3px rgba(0,0,0,0.05)" }}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: target.pickup_none ? "rgba(255,255,255,0.25)" : "transparent", border: target.pickup_none ? "none" : "2.5px solid rgba(26,26,26,0.22)" }}>
                              {target.pickup_none && <Icon name="check" size={20} color="#fff" strokeWidth={3} />}
                            </div>
                            <div style={{ fontFamily: C.body, fontSize: 16.5, fontWeight: target.pickup_none ? 600 : 500, color: target.pickup_none ? "#fff" : C.charcoal }}>Nothing was out to pick up</div>
                          </button>
                        )}
                        {!target.pickup_none && (
                          <PhotoCapture
                            stopId={target.id}
                            kind="pickup"
                            title="Pick-up photo"
                            existingPhotos={pickPhotos}
                            onPhotoAdded={() => bumpPhoto(target.id, "pickup")}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ACTION ZONE */}
          <div style={{ marginTop: 14 }}>
            {target.status === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => window.open(mapsHref(cust), "_blank")} style={{ flex: 1, minHeight: 54, borderRadius: 15, background: C.gold, color: C.charcoal, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Icon name="nav" size={18} color={C.charcoal} /> Navigate
                  </button>
                  <button onClick={() => setProblemFor(target)} style={{ width: 54, minHeight: 54, borderRadius: 15, background: "#fff", border: `1px solid ${C.creamDark}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="alert" size={20} color={C.goldDark} />
                  </button>
                </div>
                <SlideToConfirm label="Slide to arrive" onConfirm={() => arrive(target)} />
              </div>
            )}
            {target.status === "arrived" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => canComplete && complete(target)} disabled={!canComplete} style={{ flex: 1, minHeight: 60, borderRadius: 16, border: `1.5px solid ${canComplete ? C.green : "rgba(26,26,26,0.12)"}`, background: canComplete ? C.green : "rgba(26,26,26,0.05)", color: canComplete ? C.cream : "rgba(26,26,26,0.3)", fontSize: 15, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", cursor: canComplete ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <Icon name="check" size={20} color={canComplete ? C.cream : "rgba(26,26,26,0.3)"} /> Complete Stop
                  </button>
                  <button onClick={() => setProblemFor(target)} title="Cancel delivery" style={{ width: 60, minHeight: 60, borderRadius: 16, background: "#fff", border: `1px solid ${C.creamDark}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="alert" size={22} color={C.goldDark} />
                  </button>
                </div>
                {!canComplete && completeHint && (
                  <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>
                    {completeHint}
                  </div>
                )}
              </div>
            )}
          </div>
        </BottomShell>
      )}

      {overview && <OverviewSheet stops={stops} targetId={targetId} isManager={isManager} onPick={(id) => { selectPin(id); setOverview(false); }} onClose={() => setOverview(false)} onBack={() => router.push("/dispatch")} onSignOut={async () => { await logout(); router.push("/"); }} />}
      {problemFor && (
        <ProblemSheet
          name={firstName(problemFor.customer!.name)}
          progress={(() => {
            const bits: string[] = [];
            if (problemFor.dropoff_confirmed) bits.push("drop-off confirmed");
            if (problemFor.pickup_confirmed) bits.push("pick-up confirmed");
            const n = photoCount(problemFor);
            if (n > 0) bits.push(`${n} photo${n > 1 ? "s" : ""}`);
            return bits.length ? bits.join(" · ") : null;
          })()}
          onClose={() => setProblemFor(null)}
          onResolve={resolveProblem}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}
