"use client";

import { useState, useTransition } from "react";
import {
  createProspect,
  updateProspect,
  logTouchpoint,
  updateTouchpoint,
  deleteTouchpoint,
  deleteProspect,
  convertProspectToCustomer,
} from "@/lib/actions/prospects";
import { townFromAddress } from "@/lib/town";
import { googleVoiceCallHref } from "@/lib/phone";
import { isOverdueForVisit, OVERDUE_DAYS } from "@/lib/prospectVisit";
import { getRoutePositioning, saveRoutePosition } from "@/lib/actions/customers";
import RouteMap from "@/components/RouteMap";
import ProspectMap, { pinColor } from "@/components/ProspectMap";
import type { RouteStop } from "@/lib/types";
import type { RoutePositioning } from "@/lib/actions/customers";
import type {
  Prospect,
  ProspectStatus,
  ProspectBusinessType,
  ProspectService,
  ProspectTouchpoint,
  TouchpointType,
} from "@/lib/types";

const STATUSES: { id: ProspectStatus; label: string }[] = [
  { id: "new", label: "New" },
  { id: "working", label: "Working" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
  { id: "dead", label: "Dead" },
];

// Property managers first — top priority (rental turnover linen).
const TYPES: { id: ProspectBusinessType; label: string }[] = [
  { id: "prop_manager", label: "Property Manager" },
  { id: "hotel", label: "Hotel / Resort" },
  { id: "club", label: "Golf / Yacht Club" },
  { id: "restaurant", label: "Restaurant" },
  { id: "retail", label: "Retail" },
  { id: "other", label: "Other" },
];

const SERVICES: { id: ProspectService; label: string }[] = [
  { id: "employees", label: "Employees" },
  { id: "linen", label: "Linen" },
  { id: "referral", label: "Customer Referral" },
];

const TOUCH_TYPES: { id: TouchpointType; label: string; icon: string }[] = [
  { id: "visit", label: "Visit", icon: "🚪" },
  { id: "delivery", label: "Delivery", icon: "🚐" },
  { id: "call", label: "Call", icon: "📞" },
  { id: "email", label: "Email", icon: "✉️" },
  { id: "text", label: "Text", icon: "💬" },
  { id: "note", label: "Note", icon: "📝" },
];

const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

const typeLabel = (t: ProspectBusinessType) => TYPES.find((x) => x.id === t)?.label ?? t;

function statusStyle(s: ProspectStatus) {
  switch (s) {
    case "new": return "bg-cream-dark text-charcoal/60";
    case "working": return "bg-gold-primary/20 text-gold-dark";
    case "active": return "bg-green-primary text-cream";
    case "on_hold": return "bg-charcoal/10 text-charcoal/50";
    case "dead": return "bg-charcoal/10 text-charcoal/40";
  }
}

// Out of the working pipeline (sorted below the call list).
const closed = (s: ProspectStatus) => s === "active" || s === "on_hold" || s === "dead";

function lastTouch(p: Prospect): string | null {
  return p.touchpoints?.[0]?.created_at ?? null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function agoLabel(days: number | null): string {
  if (days == null) return "never";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 60) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

type ProspectSort = "town" | "name" | "touched";
const SORTS: { id: ProspectSort; label: string }[] = [
  { id: "town", label: "Town" },
  { id: "name", label: "A–Z" },
  { id: "touched", label: "Last touch" },
];
const prospectTown = (p: Prospect) => p.town ?? townFromAddress(p.address);

export default function ProspectDirectory({ prospects: initial }: { prospects: Prospect[] }) {
  const [prospects, setProspects] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ProspectStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<ProspectSort>("town");
  const [, startTransition] = useTransition();

  const filtered = prospects
    .filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.contact_name ?? "").toLowerCase().includes(q) ||
          (p.address ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      // Overdue-for-a-visit always floats to the very top, then the chosen sort
      // orders within each group.
      const oa = isOverdueForVisit(a);
      const ob = isOverdueForVisit(b);
      if (oa !== ob) return oa ? -1 : 1;
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "town") {
        const at = prospectTown(a);
        const bt = prospectTown(b);
        if (at !== bt) {
          if (!at) return 1; // no-town sinks to the bottom
          if (!bt) return -1;
          return at.localeCompare(bt);
        }
        return a.name.localeCompare(b.name); // alpha within a town
      }
      // "touched": most recently touched first, never-touched last.
      const al = lastTouch(a);
      const bl = lastTouch(b);
      if (!al && !bl) return a.name.localeCompare(b.name);
      if (!al) return 1;
      if (!bl) return -1;
      return bl.localeCompare(al);
    });

  const selected = prospects.find((p) => p.id === selectedId) || null;
  const counts = STATUSES.map((s) => ({ ...s, n: prospects.filter((p) => p.status === s.id).length }));
  const overdueCount = prospects.filter(isOverdueForVisit).length;

  function patch(id: string, fields: Partial<Prospect>) {
    setProspects((ps) => ps.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  const Toggle = () => (
    <div className="inline-flex rounded-lg bg-cream-dark/60 p-0.5 text-xs font-body">
      <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md uppercase tracking-wide ${view === "list" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal/50"}`}>List</button>
      <button onClick={() => { setView("map"); setAdding(false); }} className={`px-3 py-1.5 rounded-md uppercase tracking-wide ${view === "map" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal/50"}`}>Map</button>
    </div>
  );

  // ── Map view: every business, colored by status ──
  if (view === "map") {
    const pinned = filtered.filter((p) => p.lat != null && p.lng != null);
    return (
      <div className="flex flex-col md:h-screen">
        <div className="p-4 border-b border-cream-dark space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl font-light text-charcoal leading-none">Prospects</h2>
              <p className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-1">{pinned.length} on the map</p>
            </div>
            <Toggle />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setFilter("all")} className={`px-3 py-1 rounded-full text-xs font-body ${filter === "all" ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/60"}`}>All</button>
            {counts.map((s) => (
              <button key={s.id} onClick={() => setFilter(s.id)} className={`px-3 py-1 rounded-full text-xs font-body ${filter === s.id ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/60"}`}>
                {s.label} {s.n > 0 && <span className="opacity-60">{s.n}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="relative flex-1 min-h-[65vh]">
          <ProspectMap
            prospects={pinned}
            targetId={selectedId}
            onSelect={(id) => { setSelectedId(id); setView("list"); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="md:flex md:h-screen">
      {/* Master list */}
      <div className={`${selected ? "hidden md:flex" : "flex"} md:w-96 md:border-r md:border-cream-dark flex-col`}>
        <div className="p-4 border-b border-cream-dark space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl font-light text-charcoal leading-none">Prospects</h2>
              <p className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-1">
                {prospects.filter((p) => !closed(p.status)).length} in pipeline
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Toggle />
              <button
                onClick={() => { setAdding(true); setSelectedId(null); }}
                className="min-h-tap px-3 py-1.5 bg-green-primary text-cream rounded-lg text-xs font-body uppercase tracking-widest"
              >
                + Add
              </button>
            </div>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search business or contact…"
            className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
          />
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-body ${filter === "all" ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/60"}`}
            >
              All
            </button>
            {counts.map((s) => (
              <button
                key={s.id}
                onClick={() => setFilter(s.id)}
                className={`px-3 py-1 rounded-full text-xs font-body ${filter === s.id ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/60"}`}
              >
                {s.label} {s.n > 0 && <span className="opacity-60">{s.n}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest shrink-0">Sort</span>
            <div className="inline-flex rounded-lg bg-cream-dark/60 p-0.5 text-xs font-body">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSort(s.id)}
                  className={`px-2.5 py-1 rounded-md ${sort === s.id ? "bg-cream text-charcoal shadow-sm" : "text-charcoal/50"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="md:flex-1 md:overflow-auto p-3 space-y-1.5">
          {overdueCount > 0 && (
            <div className="flex items-start gap-2 bg-gold-primary/15 border border-gold-primary/40 rounded-xl px-3 py-2.5 mb-1">
              <span className="text-gold-dark">🔔</span>
              <p className="text-xs font-body text-charcoal">
                <b>{overdueCount}</b> prospect{overdueCount === 1 ? "" : "s"} not visited in {OVERDUE_DAYS}+ days — pinned to the top.
              </p>
            </div>
          )}
          {filtered.map((p) => {
            const days = daysSince(lastTouch(p));
            const cold = !closed(p.status) && (days == null || days > 30);
            const overdue = isOverdueForVisit(p);
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedId(p.id); setAdding(false); }}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedId === p.id ? "bg-green-primary/5 border-green-primary/30" : overdue ? "bg-gold-primary/5 border-gold-primary/40" : "bg-cream border-cream-dark"}`}
              >
                <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: pinColor(p.status) }} />
                <div className="flex-1 min-w-0">
                  <span className="font-body font-medium text-charcoal truncate block">
                    {overdue && <span className="text-gold-dark" title={`Not visited in ${OVERDUE_DAYS}+ days`}>🔔 </span>}
                    {p.name}
                  </span>
                  <p className="text-xs text-charcoal/40 font-body truncate">
                    {(p.town ?? townFromAddress(p.address)) ? `${p.town ?? townFromAddress(p.address)} · ` : ""}
                    {typeLabel(p.business_type)}
                    {p.contact_name ? ` · ${p.contact_name}` : ""}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full ${statusStyle(p.status)}`}>
                    {STATUSES.find((s) => s.id === p.status)?.label}
                  </span>
                  <span className={`text-[11px] font-body ${cold ? "text-gold-dark font-medium" : "text-charcoal/40"}`}>
                    {agoLabel(days)}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-charcoal/40 font-body py-8 text-sm">No prospects match.</p>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className={`${selected ? "block" : "hidden md:block"} flex-1 md:overflow-auto`}>
        {selected ? (
          <Detail
            key={selected.id}
            p={selected}
            onBack={() => setSelectedId(null)}
            onPatch={(f) => patch(selected.id, f)}
            onDelete={() => {
              setProspects((ps) => ps.filter((x) => x.id !== selected.id));
              setSelectedId(null);
              startTransition(() => { deleteProspect(selected.id); });
            }}
          />
        ) : (
          <div className="hidden md:flex h-full items-center justify-center text-charcoal/30 font-body">
            Select a prospect
          </div>
        )}
      </div>

      {/* Add a prospect — centered popup (works the same on desktop + mobile) */}
      {adding && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/40 flex items-start md:items-center justify-center p-4 overflow-auto"
          onClick={() => setAdding(false)}
        >
          <div
            className="bg-cream rounded-2xl w-full max-w-lg my-auto shadow-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <AddForm
              onCancel={() => setAdding(false)}
              onCreated={(p) => {
                setProspects((ps) => [...ps, { ...p, touchpoints: [] }]);
                setAdding(false);
                setSelectedId(p.id);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({
  p, onBack, onPatch, onDelete,
}: {
  p: Prospect;
  onBack: () => void;
  onPatch: (f: Partial<Prospect>) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(p.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [touchType, setTouchType] = useState<TouchpointType | null>(null);
  const [touchNote, setTouchNote] = useState("");
  const [touchDate, setTouchDate] = useState(todayStr);
  // Editing a past touch (null = none open).
  const [editTouchId, setEditTouchId] = useState<string | null>(null);
  const [editTouchType, setEditTouchType] = useState<TouchpointType>("note");
  const [editTouchNote, setEditTouchNote] = useState("");
  const [editTouchDate, setEditTouchDate] = useState(todayStr);
  const [touchBusy, setTouchBusy] = useState(false);
  // Dead requires a reason (null = popup closed).
  const [deadReason, setDeadReason] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const [routePos, setRoutePos] = useState<RoutePositioning | null>(null);
  const [routePosBusy, setRoutePosBusy] = useState(false);
  // Activation popup: which services the new account buys (null = closed).
  const [svcPick, setSvcPick] = useState<ProspectService[] | null>(null);
  const [, startTransition] = useTransition();
  const dirty = notes !== (p.notes ?? "");

  function setStatus(status: ProspectStatus) {
    if (status === "active" && p.status !== "active") {
      // Going active = they're a customer now; capture what they buy first.
      setSvcPick(p.services ?? []);
      return;
    }
    if (status === "dead" && p.status !== "dead") {
      // Dead requires a reason so the list stays auditable.
      setDeadReason("");
      return;
    }
    onPatch({ status });
    startTransition(() => { updateProspect(p.id, { status }); });
  }

  async function confirmDead() {
    const reason = deadReason?.trim();
    if (!reason) return;
    onPatch({ status: "dead" });
    setDeadReason(null);
    await updateProspect(p.id, { status: "dead" });
    const res = await logTouchpoint(p.id, "note", `Marked dead — ${reason}`);
    if (res.touchpoint) {
      onPatch({ touchpoints: [res.touchpoint as ProspectTouchpoint, ...(p.touchpoints ?? [])] });
    }
  }

  function confirmActive() {
    const services = svcPick ?? [];
    onPatch({ status: "active", services });
    setSvcPick(null);
    startTransition(() => { updateProspect(p.id, { status: "active", services }); });
  }

  function toggleService(s: ProspectService) {
    const current = p.services ?? [];
    const services = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    onPatch({ services });
    startTransition(() => { updateProspect(p.id, { services }); });
  }

  async function saveTouch() {
    if (!touchType) return;
    setBusy(true);
    const res = await logTouchpoint(p.id, touchType, touchNote, touchDate);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    const tp = res.touchpoint as ProspectTouchpoint;
    // Keep history sorted even when the touch is backdated.
    const touchpoints = [tp, ...(p.touchpoints ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    onPatch({
      touchpoints,
      ...(p.status === "new" ? { status: "working" as ProspectStatus } : {}),
    });
    setTouchType(null);
    setTouchNote("");
    setTouchDate(todayStr());
  }

  function openEditTouch(t: ProspectTouchpoint) {
    setEditTouchId(t.id);
    setEditTouchType(t.type);
    setEditTouchNote(t.note ?? "");
    setEditTouchDate(t.created_at.slice(0, 10));
    setError("");
  }

  async function saveEditTouch() {
    if (!editTouchId) return;
    setTouchBusy(true);
    const res = await updateTouchpoint(editTouchId, {
      type: editTouchType,
      note: editTouchNote,
      date: editTouchDate,
    });
    setTouchBusy(false);
    if (res.error || !res.touchpoint) { setError(res.error ?? "Couldn't save"); return; }
    const updated = res.touchpoint as ProspectTouchpoint;
    const touchpoints = (p.touchpoints ?? [])
      .map((t) => (t.id === updated.id ? updated : t))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    onPatch({ touchpoints });
    setEditTouchId(null);
  }

  async function removeTouch(id: string) {
    if (!confirm("Delete this logged touch?")) return;
    setTouchBusy(true);
    const res = await deleteTouchpoint(id);
    setTouchBusy(false);
    if (res.error) { setError(res.error); return; }
    onPatch({ touchpoints: (p.touchpoints ?? []).filter((t) => t.id !== id) });
    setEditTouchId(null);
  }

  async function saveNotes() {
    onPatch({ notes: notes.trim() || null });
    await updateProspect(p.id, { notes: notes.trim() || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function convert() {
    setConverting(true);
    const res = await convertProspectToCustomer(p.id);
    setConverting(false);
    if (res.error || !res.customer) { setError(res.error ?? "Conversion failed"); return; }
    onPatch({ status: "active", customer_id: res.customer.id });
    // Show route positioning suggestion immediately after adding to customer directory.
    getRoutePositioning(res.customer.id).then((r) => setRoutePos(r)).catch(() => {});
  }

  async function confirmRoutePos() {
    if (!routePos?.suggestion || !p.customer_id) return;
    setRoutePosBusy(true);
    await saveRoutePosition(p.customer_id, routePos.suggestion.seq);
    setRoutePos((r) => r ? { ...r, current: routePos.suggestion!.seq, suggestion: null } : r);
    setRoutePosBusy(false);
  }

  if (editing) {
    return (
      <EditProspect
        p={p}
        onCancel={() => setEditing(false)}
        onSaved={(f) => { onPatch(f); setEditing(false); }}
      />
    );
  }

  return (
    <div className="p-5 md:p-8 md:max-w-2xl space-y-5">
      <button onClick={onBack} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-light text-charcoal">{p.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-charcoal/40 font-body">{typeLabel(p.business_type)}</span>
            {(p.town ?? townFromAddress(p.address)) && (
              <span className="text-[11px] font-body bg-gold-primary/20 text-gold-dark rounded-full px-2 py-0.5">
                📍 {p.town ?? townFromAddress(p.address)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 min-h-tap px-3 py-1.5 rounded-lg border border-cream-dark bg-cream text-charcoal/60 text-xs font-body uppercase tracking-widest"
        >
          ✎ Edit
        </button>
      </div>

      {isOverdueForVisit(p) && (
        <div className="flex items-center gap-2 bg-gold-primary/15 border border-gold-primary/40 rounded-xl px-3 py-2.5">
          <span className="text-gold-dark">🔔</span>
          <p className="text-xs font-body text-charcoal">Overdue for a visit — log a Visit below to clear this.</p>
        </div>
      )}

      {/* Status pipeline */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Status</p>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              className={`min-h-tap px-3.5 py-1.5 rounded-full text-xs font-body ${p.status === s.id ? statusStyle(s.id) + " ring-1 ring-green-primary/40" : "bg-cream border border-cream-dark text-charcoal/50"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {p.status === "active" && (
          <div className="mt-3">
            <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Services</p>
            <div className="flex gap-1.5 flex-wrap">
              {SERVICES.map((s) => {
                const on = (p.services ?? []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    className={`min-h-tap px-3.5 py-1.5 rounded-full text-xs font-body ${on ? "bg-gold-primary text-charcoal" : "bg-cream border border-cream-dark text-charcoal/50"}`}
                  >
                    {on ? "★ " : ""}{s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {p.status === "active" && !p.customer_id && (
          <button
            onClick={convert}
            disabled={converting}
            className="w-full mt-3 min-h-tap bg-gold-primary text-charcoal font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60"
          >
            {converting ? "Adding…" : "Add to Customer Directory"}
          </button>
        )}
        {p.customer_id && (
          <p className="mt-2 text-xs text-green-primary font-body">✓ In the customer directory</p>
        )}
      </div>

      {/* Route positioning — appears after converting to customer */}
      {routePos?.ok && routePos.suggestion && (() => {
        const master = routePos.masterRoute;
        const posMapStops: RouteStop[] = [
          ...master.slice(0, routePos.suggestion.index),
          { id: p.customer_id ?? p.id, name: p.name, lat: routePos.suggestion.lat, lng: routePos.suggestion.lng } as unknown as RouteStop,
          ...master.slice(routePos.suggestion.index),
        ].map((s, i) => ({
          id: (s as { id: string }).id,
          stop_order: i + 1,
          status: "pending",
          customer: { name: (s as { name: string }).name, address: "", lat: (s as { lat: number }).lat, lng: (s as { lng: number }).lng },
        })) as unknown as RouteStop[];
        return (
          <div>
            <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Route Position</p>
            <div className="bg-cream rounded-xl border border-cream-dark p-3">
              <p className="text-sm font-body text-charcoal">
                Suggested spot
                {routePos.suggestion.before && routePos.suggestion.after ? (
                  <>, between <b>{routePos.suggestion.before}</b> &amp; <b>{routePos.suggestion.after}</b></>
                ) : routePos.suggestion.before ? (
                  <>, after <b>{routePos.suggestion.before}</b></>
                ) : routePos.suggestion.after ? (
                  <>, before <b>{routePos.suggestion.after}</b></>
                ) : null}.
              </p>
              <div className="relative h-44 mt-3 rounded-lg overflow-hidden border border-cream-dark">
                <RouteMap stops={posMapStops} targetId={p.customer_id ?? p.id} onSelect={() => {}} suggestedIds={[p.customer_id ?? p.id]} />
              </div>
              <button onClick={confirmRoutePos} disabled={routePosBusy} className="w-full mt-3 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
                {routePosBusy ? "Saving…" : "Confirm this spot"}
              </button>
            </div>
          </div>
        );
      })()}
      {routePos?.ok && routePos.current != null && (
        <p className="text-xs text-green-primary font-body">✓ Placed in route, position {Math.round(routePos.current)}</p>
      )}

      {/* Dead popup: a reason is required so the list stays auditable */}
      {deadReason !== null && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 flex items-center justify-center p-6" onClick={() => setDeadReason(null)}>
          <div className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-serif text-xl font-light text-charcoal">Mark {p.name} dead</h3>
              <p className="text-xs text-charcoal/50 font-body mt-1">Why is this not winnable? (required)</p>
            </div>
            <textarea
              value={deadReason}
              onChange={(e) => setDeadReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. laundry on site, contracted with Mattituck, hard no from GM…"
              className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
            />
            <div className="flex gap-2">
              <button
                onClick={confirmDead}
                disabled={!deadReason.trim()}
                className="flex-1 min-h-tap bg-charcoal text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-40"
              >
                Mark Dead
              </button>
              <button onClick={() => setDeadReason(null)} className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activation popup: capture what the new account buys */}
      {svcPick !== null && (
        <div className="fixed inset-0 z-50 bg-charcoal/40 flex items-center justify-center p-6" onClick={() => setSvcPick(null)}>
          <div className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-serif text-xl font-light text-charcoal">{p.name} is now active 🎉</h3>
              <p className="text-xs text-charcoal/50 font-body mt-1">What do they buy?</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {SERVICES.map((s) => {
                const on = svcPick.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => setSvcPick(on ? svcPick.filter((x) => x !== s.id) : [...svcPick, s.id])}
                    className={`min-h-tap px-3.5 py-2 rounded-full text-xs font-body ${on ? "bg-gold-primary text-charcoal" : "bg-cream-dark text-charcoal/50"}`}
                  >
                    {on ? "★ " : ""}{s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={confirmActive} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg">
                Mark Active
              </button>
              <button onClick={() => setSvcPick(null)} className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact info */}
      <div className="space-y-1.5">
        {p.contact_name && (
          <p className="text-sm font-body text-charcoal">
            {p.contact_name}
            {p.contact_title && <span className="text-charcoal/40"> — {p.contact_title}</span>}
          </p>
        )}
        {p.phone && <a href={googleVoiceCallHref(p.phone)} target="_blank" rel="noopener noreferrer" className="block text-sm text-green-primary font-body">📞 {p.phone}</a>}
        {p.email && <a href={`mailto:${p.email}`} className="block text-sm text-green-primary font-body break-all">✉️ {p.email}</a>}
        {p.address && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`}
            target="_blank" rel="noopener noreferrer"
            className="block text-sm text-charcoal/70 font-body underline underline-offset-2"
          >
            {p.address}
          </a>
        )}
        {p.website && (
          <a
            href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
            target="_blank" rel="noopener noreferrer"
            className="block text-sm text-charcoal/50 font-body"
          >
            🌐 {p.website.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>

      {/* Log a touchpoint */}
      <div className="bg-green-primary/5 border border-green-primary/20 rounded-xl p-3">
        <p className="text-xs text-green-primary font-body uppercase tracking-widest mb-2">Log a Touch</p>
        <div className="flex gap-1.5 flex-wrap">
          {TOUCH_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTouchType(touchType === t.id ? null : t.id)}
              className={`min-h-tap px-3 py-2 rounded-lg text-xs font-body ${touchType === t.id ? "bg-green-primary text-cream" : "bg-cream border border-cream-dark text-charcoal/60"}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {touchType && (
          <div className="mt-2.5 space-y-2">
            <textarea
              value={touchNote}
              onChange={(e) => setTouchNote(e.target.value)}
              rows={2}
              placeholder="What happened? (optional)"
              className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
            />
            <label className="flex items-center gap-2 text-xs text-charcoal/50 font-body">
              When:
              <input
                type="date"
                value={touchDate}
                max={todayStr()}
                onChange={(e) => setTouchDate(e.target.value)}
                className="min-h-tap px-2.5 py-1.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
              />
            </label>
            <button
              onClick={saveTouch}
              disabled={busy}
              className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-2.5 rounded-lg disabled:opacity-60"
            >
              {busy ? "Saving…" : `Log ${TOUCH_TYPES.find((t) => t.id === touchType)?.label}`}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600 font-body">{error}</p>}

      {/* Notes */}
      <div className="bg-gold-primary/10 border border-gold-primary/30 rounded-xl p-3">
        <label className="text-xs text-gold-dark font-body uppercase tracking-widest block mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Angle, pricing discussed, who to ask for…"
          className="w-full bg-transparent text-sm font-body text-charcoal resize-none focus:outline-none placeholder:text-charcoal/30"
        />
      </div>
      {dirty && (
        <button onClick={saveNotes} className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg">Save Notes</button>
      )}
      {saved && <p className="text-center text-xs text-green-primary font-body">✓ Saved</p>}

      {/* Touch history */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Touch History</p>
        {(p.touchpoints ?? []).length === 0 ? (
          <p className="text-sm text-charcoal/40 font-body">No touches logged yet.</p>
        ) : (
          <div className="space-y-2">
            {(p.touchpoints ?? []).slice(0, 12).map((t) =>
              editTouchId === t.id ? (
                <div key={t.id} className="bg-cream rounded-lg border border-green-primary/40 p-3 space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {TOUCH_TYPES.map((tt) => (
                      <button
                        key={tt.id}
                        onClick={() => setEditTouchType(tt.id)}
                        className={`min-h-tap px-2.5 py-1.5 rounded-lg text-xs font-body ${editTouchType === tt.id ? "bg-green-primary text-cream" : "bg-cream border border-cream-dark text-charcoal/60"}`}
                      >
                        {tt.icon} {tt.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={editTouchNote}
                    onChange={(e) => setEditTouchNote(e.target.value)}
                    rows={2}
                    placeholder="What happened?"
                    className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
                  />
                  <label className="flex items-center gap-2 text-xs text-charcoal/50 font-body">
                    When:
                    <input
                      type="date"
                      value={editTouchDate}
                      max={todayStr()}
                      onChange={(e) => setEditTouchDate(e.target.value)}
                      className="min-h-tap px-2.5 py-1.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={saveEditTouch} disabled={touchBusy} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-2 rounded-lg disabled:opacity-60">
                      {touchBusy ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => removeTouch(t.id)} disabled={touchBusy} className="min-h-tap px-3 text-red-500 font-body text-xs uppercase tracking-widest">Delete</button>
                    <button onClick={() => setEditTouchId(null)} className="min-h-tap px-3 text-charcoal/40 font-body text-xs uppercase tracking-widest">Cancel</button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="bg-cream rounded-lg border border-cream-dark p-3">
                  <div className="flex items-center gap-2 text-sm font-body text-charcoal">
                    <span>{TOUCH_TYPES.find((x) => x.id === t.type)?.icon}</span>
                    <span className="capitalize">{t.type}</span>
                    {t.created_by && <span className="text-charcoal/40 text-xs">· {t.created_by}</span>}
                    <span className="text-charcoal/40 text-xs ml-auto">{fmtDate(t.created_at)}</span>
                    <button onClick={() => openEditTouch(t)} className="text-charcoal/40 hover:text-charcoal text-xs font-body" aria-label="Edit touch">✎</button>
                  </div>
                  {t.note && <p className="text-xs text-charcoal/60 font-body mt-1">{t.note}</p>}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => { if (confirm(`Remove ${p.name}?`)) onDelete(); }}
        className="text-xs text-red-400 font-body uppercase tracking-widest"
      >
        Remove prospect
      </button>
    </div>
  );
}

function EditProspect({
  p, onCancel, onSaved,
}: {
  p: Prospect;
  onCancel: () => void;
  onSaved: (fields: Partial<Prospect>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [businessType, setBusinessType] = useState<ProspectBusinessType>(p.business_type);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const val = (n: string) => (fd.get(n) as string).trim();
    const fields = {
      name: val("name"),
      contact_name: val("contact_name") || undefined,
      contact_title: val("contact_title") || undefined,
      phone: val("phone") || undefined,
      email: val("email") || undefined,
      address: val("address") || undefined,
      town: val("town") || undefined,
      website: val("website") || undefined,
      business_type: businessType,
    };
    start(async () => {
      const res = await updateProspect(p.id, fields);
      if (res.error) { setError(res.error); return; }
      onSaved({
        name: fields.name,
        contact_name: fields.contact_name ?? null,
        contact_title: fields.contact_title ?? null,
        phone: fields.phone ?? null,
        email: fields.email ?? null,
        address: fields.address ?? null,
        town: fields.town ?? townFromAddress(fields.address) ?? null,
        website: fields.website ?? null,
        business_type: businessType,
      });
    });
  }

  const field = "w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";
  const label = "text-[11px] text-charcoal/40 font-body uppercase tracking-widest block mb-1";

  return (
    <form onSubmit={submit} className="p-5 md:p-8 md:max-w-2xl space-y-3">
      <button type="button" onClick={onCancel} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>
      <h2 className="font-serif text-2xl font-light text-charcoal">Edit {p.name}</h2>
      <div>
        <span className={label}>Business name</span>
        <input name="name" defaultValue={p.name} required className={field} />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setBusinessType(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-body ${businessType === t.id ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>Main contact (POC)</span>
          <input name="contact_name" defaultValue={p.contact_name ?? ""} className={field} />
        </div>
        <div>
          <span className={label}>Title</span>
          <input name="contact_title" defaultValue={p.contact_title ?? ""} className={field} />
        </div>
      </div>
      <div>
        <span className={label}>Phone</span>
        <input name="phone" defaultValue={p.phone ?? ""} className={field} />
      </div>
      <div>
        <span className={label}>Email</span>
        <input name="email" type="email" defaultValue={p.email ?? ""} className={field} />
      </div>
      <div>
        <span className={label}>Address</span>
        <input name="address" defaultValue={p.address ?? ""} className={field} />
        <p className="text-[11px] text-charcoal/40 font-body mt-1">Changing the address re-pins them on the map.</p>
      </div>
      <div>
        <span className={label}>Town</span>
        <input name="town" defaultValue={p.town ?? townFromAddress(p.address) ?? ""} placeholder="e.g. Sag Harbor" className={field} />
        <p className="text-[11px] text-charcoal/40 font-body mt-1">Auto-filled from the address; edit to override.</p>
      </div>
      <div>
        <span className={label}>Website</span>
        <input name="website" defaultValue={p.website ?? ""} className={field} />
      </div>
      {error && <p className="text-sm text-red-600 font-body">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
          {pending ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest">Cancel</button>
      </div>
    </form>
  );
}

function AddForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: Prospect) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [businessType, setBusinessType] = useState<ProspectBusinessType>("other");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createProspect({
        name: fd.get("name") as string,
        contact_name: (fd.get("contact_name") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        address: (fd.get("address") as string) || undefined,
        business_type: businessType,
        notes: (fd.get("notes") as string) || undefined,
      });
      if (res.error) setError(res.error);
      else if (res.prospect) onCreated(res.prospect as Prospect);
    });
  }

  const field = "w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";

  return (
    <form onSubmit={submit} className="p-5 md:p-8 md:max-w-2xl space-y-3">
      <button type="button" onClick={onCancel} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>
      <h2 className="font-serif text-2xl font-light text-charcoal">New Prospect</h2>
      <input name="name" placeholder="Business name" required className={field} />
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setBusinessType(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-body ${businessType === t.id ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <input name="contact_name" placeholder="Contact person (optional)" className={field} />
      <input name="phone" placeholder="Phone (optional)" className={field} />
      <input name="email" type="email" placeholder="Email (optional)" className={field} />
      <input name="address" placeholder="Address (optional)" className={field} />
      <textarea name="notes" placeholder="Notes (optional)" rows={2} className={`${field} resize-none`} />
      {error && <p className="text-sm text-red-600 font-body">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg">
          {pending ? "Adding…" : "Add Prospect"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest">Cancel</button>
      </div>
    </form>
  );
}
