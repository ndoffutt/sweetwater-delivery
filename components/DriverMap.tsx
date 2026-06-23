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
import { googleVoiceCallHref } from "@/lib/phone";
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
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", background: checked ? "rgba(2,115,62,0.06)" : "#fff", border: `1.5px solid ${checked ? C.green : C.creamDark}`, borderRadius: 14, padding: "14px 16px", transition: "all .15s" }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: checked ? C.green : "transparent", border: checked ? "none" : "2px solid rgba(26,26,26,0.2)" }}>
        {checked && <Icon name="check" size={16} color={C.cream} strokeWidth={2.8} />}
      </div>
      <Icon name={icon} size={18} color={checked ? C.green : "rgba(26,26,26,0.4)"} />
      <div style={{ fontFamily: C.body, fontSize: 15.5, color: C.charcoal }}>{label}</div>
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

function ProblemSheet({ name, onClose, onResolve }: { name: string; onClose: () => void; onResolve: (reason: string) => void }) {
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
export default function DriverMap({ initialStops, isManager, canMessage = false }: { initialStops: RouteStop[]; isManager: boolean; canMessage?: boolean }) {
  const [stops, setStops] = useState(initialStops);
  const [targetId, setTargetId] = useState(() => (initialStops.find((s) => s.status === "pending" || s.status === "arrived") ?? initialStops[0])?.id ?? "");
  const [sheet, setSheet] = useState<"peek" | "full">("peek");
  const [overview, setOverview] = useState(false);
  const [problemFor, setProblemFor] = useState<RouteStop | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [photoBump, setPhotoBump] = useState<Record<string, number>>({});
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

  function flash(msg: string) { setToast(msg); if (tt.current) clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 2600); }
  function patch(id: string, f: Partial<RouteStop>) { setStops((arr) => arr.map((s) => (s.id === id ? { ...s, ...f } : s))); }

  const remaining = stops.filter((s) => s.status === "pending" || s.status === "arrived");
  const finished = stops.filter((s) => s.status === "completed" || s.status === "skipped");
  const target = stops.find((s) => s.id === targetId) || remaining[0];
  const allDone = remaining.length === 0;
  const photoCount = (s: RouteStop) => (s.photos?.length ?? 0) + (photoBump[s.id] ?? 0);

  function selectPin(id: string) { setTargetId(id); setSheet("peek"); }

  function arrive(s: RouteStop) {
    patch(s.id, { status: "arrived", arrived_at: new Date().toISOString() });
    setSheet("full");
    flash(online ? `✓ Texted ${firstName(s.customer!.name)}: “On our way”` : "Saved on phone, will sync when signal returns");
    startTransition(async () => {
      await runStopAction({ kind: "status", stopId: s.id, status: "arrived" });
      router.refresh();
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
      router.refresh();
    });
  }

  function toggleDrop(s: RouteStop) {
    const v = !s.dropoff_confirmed;
    patch(s.id, { dropoff_confirmed: v });
    startTransition(async () => { await runStopAction({ kind: "dropoff", stopId: s.id, confirmed: v }); });
  }
  function togglePick(s: RouteStop) {
    const v = !s.pickup_confirmed;
    patch(s.id, { pickup_confirmed: v });
    startTransition(async () => { await runStopAction({ kind: "pickup", stopId: s.id, confirmed: v }); });
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
      router.refresh();
    });
  }

  const cust = target?.customer;
  const didSomething = !!target && (target.dropoff_confirmed || target.pickup_confirmed);
  const canComplete = !!target && photoCount(target) > 0 && didSomething;
  const existingPhotos = target ? (target.photos ?? []).map((p) => ({ id: p.id, url: STORAGE_BASE + p.storage_path })) : [];

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
          </div>
        </BottomShell>
      ) : target && target.kind === "prospect_visit" && target.prospect_visit ? (
        <BottomShell onGrip={() => setSheet(sheet === "peek" ? "full" : "peek")} expanded={sheet === "full"}>
          <ProspectVisitSheet
            stop={target}
            expanded={sheet === "full"}
            onLogged={() => {
              patch(target.id, { status: "completed", completed_at: new Date().toISOString() });
              flash("Visit logged");
              setSheet("peek");
              router.refresh();
            }}
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
                  <span style={{ fontSize: 14.5, color: C.charcoal }}>{cust.phone}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,26,0.35)" }}>Call</span>
                </a>
              )}

              {target.status === "arrived" && (
                <>
                  <div style={{ marginBottom: 9, marginLeft: 2 }}><Label>Confirm what you did</Label></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 12 }}>
                    <CheckRow label="Dropped off" icon="arrowDown" checked={target.dropoff_confirmed} onClick={() => toggleDrop(target)} />
                    <CheckRow label="Picked up" icon="arrowUp" checked={target.pickup_confirmed} onClick={() => togglePick(target)} />
                  </div>
                  <div style={{ marginBottom: 9, marginLeft: 2 }}>
                    <Label>Photo proof <span style={{ color: photoCount(target) > 0 ? C.green : C.goldDark }}>· required</span></Label>
                  </div>
                  <PhotoCapture
                    stopId={target.id}
                    existingPhotos={existingPhotos}
                    onPhotoAdded={() => setPhotoBump((b) => ({ ...b, [target.id]: (b[target.id] ?? 0) + 1 }))}
                  />
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
                {!canComplete && (
                  <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>
                    {photoCount(target) === 0 ? "Snap a photo to finish" : "Check drop-off or pick-up"}
                  </div>
                )}
              </div>
            )}
          </div>
        </BottomShell>
      )}

      {overview && <OverviewSheet stops={stops} targetId={targetId} isManager={isManager} onPick={(id) => { selectPin(id); setOverview(false); }} onClose={() => setOverview(false)} onBack={() => router.push("/dispatch")} onSignOut={async () => { await logout(); router.push("/"); }} />}
      {problemFor && <ProblemSheet name={firstName(problemFor.customer!.name)} onClose={() => setProblemFor(null)} onResolve={resolveProblem} />}
      <Toast toast={toast} />
    </div>
  );
}
