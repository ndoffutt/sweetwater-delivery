"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  saveCustomerNotes,
  saveCustomerTags,
  getRoutePositioning,
  saveRoutePosition,
  reorderRoute,
  setDeliveryDay,
  type RoutePositioning,
} from "@/lib/actions/customers";
import RouteMap from "@/components/RouteMap";
import type { Customer, RouteStop } from "@/lib/types";

export interface Activity {
  date: string;
  dropoff: boolean;
  pickup: boolean;
  pieces: number;
  photos: string[];
}

const TAGS = ["VIP", "Year-round", "Seasonal", "Commercial"];
const FILTERS = ["All", "VIP", "Year-round", "Seasonal", "Commercial"] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CustomerDirectory({
  customers: initial,
  activity,
}: {
  customers: Customer[];
  activity: Record<string, Activity[]>;
}) {
  const [customers, setCustomers] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [sort, setSort] = useState<"name" | "route">("name");
  const [dragId, setDragId] = useState<string | null>(null);
  const movedRef = useRef(false);
  // Last SAVED route order (ids in sequence), so a drag can be described
  // ("from stop X to stop Y") and undone back to the saved order.
  const savedOrderRef = useRef<string[]>([]);
  const [pendingReorder, setPendingReorder] = useState<{ name: string; from: number; to: number } | null>(null);
  const [, startTransition] = useTransition();

  // Drag-reorder is only meaningful when the full route is shown in order (no
  // search/filter hiding stops), so the new sequence is unambiguous.
  const canReorder = sort === "route" && filter === "All" && !query;

  // Pointer-based drag (works on touch + mouse; native HTML5 drag does not fire
  // on touch). As the finger/cursor moves over another stop we re-number the
  // route live so both the list and the route map reflect the new order.
  function liveReorder(src: string, targetId: string) {
    if (src === targetId) return;
    setCustomers((cs) => {
      const positioned = cs
        .filter((c) => c.route_seq != null)
        .sort((a, b) => (a.route_seq as number) - (b.route_seq as number));
      const from = positioned.findIndex((c) => c.id === src);
      const to = positioned.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0 || from === to) return cs;
      const next = [...positioned];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      const seqById = new Map(next.map((c, i) => [c.id, i + 1]));
      return cs.map((c) => (seqById.has(c.id) ? { ...c, route_seq: seqById.get(c.id)! } : c));
    });
  }

  function onHandleDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragId(id);
    movedRef.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; reorder still works without it */
    }
  }
  function onHandleMove(e: React.PointerEvent, id: string) {
    if (dragId !== id) return;
    movedRef.current = true;
    // Hit-test the pointer's Y against each row's box directly, rather than
    // document.elementFromPoint — that can return the captured handle (during
    // pointer capture) or a dev overlay, and fails for the row under the finger.
    const y = e.clientY;
    let targetId: string | null = null;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-route-id]"))) {
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        targetId = el.getAttribute("data-route-id");
        break;
      }
    }
    if (targetId) liveReorder(id, targetId);
  }
  function onHandleUp(e: React.PointerEvent, id: string) {
    const dragged = dragId === id && movedRef.current;
    setDragId(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* nothing captured */
    }
    if (!dragged) return;
    // Don't save yet — surface a warning with exactly what changed and let the
    // dispatcher confirm (or undo). Persisting only happens on confirm.
    const ordered = customers
      .filter((c) => c.route_seq != null)
      .sort((a, b) => (a.route_seq as number) - (b.route_seq as number));
    const to = ordered.findIndex((c) => c.id === id) + 1;
    const from = savedOrderRef.current.indexOf(id) + 1;
    const moved = ordered.find((c) => c.id === id);
    if (!moved || from === 0 || from === to) return; // no net change vs. saved
    setPendingReorder({ name: moved.name, from, to });
  }

  function confirmReorder() {
    const ids = customers
      .filter((c) => c.route_seq != null)
      .sort((a, b) => (a.route_seq as number) - (b.route_seq as number))
      .map((c) => c.id);
    savedOrderRef.current = ids;
    setPendingReorder(null);
    startTransition(() => {
      reorderRoute(ids);
    });
  }

  function undoReorder() {
    const rank = new Map(savedOrderRef.current.map((cid, i) => [cid, i + 1]));
    setCustomers((cs) => cs.map((c) => (rank.has(c.id) ? { ...c, route_seq: rank.get(c.id)! } : c)));
    setPendingReorder(null);
  }

  // Adopt fresh server data - EXCEPT while a drag is in progress or a reorder
  // is awaiting confirmation. Saving triggers a server refresh that lands a
  // second or two later; without this guard it stomps the next drag's local
  // state (the "drag only works once" bug). Read through a ref so the effect
  // doesn't re-run (and clobber) when the drag/banner state itself changes.
  const reorderBusyRef = useRef(false);
  reorderBusyRef.current = dragId !== null || pendingReorder !== null;
  useEffect(() => {
    if (reorderBusyRef.current) return;
    setCustomers(initial);
    savedOrderRef.current = [...initial]
      .filter((c) => c.route_seq != null)
      .sort((a, b) => (a.route_seq as number) - (b.route_seq as number))
      .map((c) => c.id);
  }, [initial]);

  const lastDelivered = (id: string) => activity[id]?.[0]?.date;

  const filtered = customers
    .filter((c) => {
      if (filter !== "All" && !(c.tags ?? []).includes(filter)) return false;
      if (query) {
        const q = query.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "route") {
        const ai = a.route_seq ?? Infinity;
        const bi = b.route_seq ?? Infinity;
        if (ai !== bi) return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });

  // Positioned customers in route order, for the route map.
  const routeStops = customers
    .filter((c) => c.route_seq != null && c.lat != null && c.lng != null)
    .sort((a, b) => (a.route_seq as number) - (b.route_seq as number))
    .map((c, i) => ({
      id: c.id,
      stop_order: i + 1,
      status: "pending",
      customer: { name: c.name, address: c.address, lat: c.lat, lng: c.lng },
    })) as unknown as RouteStop[];

  const selected = customers.find((c) => c.id === selectedId) || null;

  function patch(id: string, p: Partial<Customer>) {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  const Toggle = () => (
    <div className="inline-flex rounded-lg bg-cream-dark/60 p-0.5 text-xs font-body">
      <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-md uppercase tracking-wide ${view === "list" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal/50"}`}>List</button>
      <button onClick={() => { setView("map"); setSelectedId(null); setAdding(false); }} className={`px-3 py-1.5 rounded-md uppercase tracking-wide ${view === "map" ? "bg-cream text-charcoal shadow-sm" : "text-charcoal/50"}`}>Map</button>
    </div>
  );

  // ── Map view (full route order of all positioned customers) ──
  if (view === "map") {
    return (
      <div className="flex flex-col md:h-screen">
        <div className="flex items-center justify-between p-4 border-b border-cream-dark">
          <div>
            <h2 className="font-serif text-2xl font-light text-charcoal leading-none">Customers</h2>
            <p className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-1">{routeStops.length} stops in route order</p>
          </div>
          <Toggle />
        </div>
        <div className="relative flex-1 min-h-[60vh]">
          {routeStops.length > 0 ? (
            <RouteMap stops={routeStops} targetId={selectedId ?? ""} onSelect={(id) => { setSelectedId(id); setView("list"); }} />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-charcoal/40 font-body text-sm px-6 text-center">No customers have a route position yet.</p>
          )}
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
            <h2 className="font-serif text-2xl font-light text-charcoal">Customers</h2>
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
            placeholder="Search name or address…"
            className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-body ${filter === f ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/60"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSort((s) => (s === "name" ? "route" : "name"))}
              className="text-[11px] font-body uppercase tracking-wide text-charcoal/50 shrink-0"
            >
              Sort: {sort === "name" ? "Name" : "Route"}
            </button>
          </div>
        </div>
        {pendingReorder && (
          <div className="mx-3 mt-3 rounded-xl border border-gold-primary/50 bg-gold-primary/10 p-3">
            <p className="text-xs text-gold-dark font-body uppercase tracking-widest mb-1">Confirm route change</p>
            <p className="text-sm font-body text-charcoal">
              Move <b>{pendingReorder.name}</b> from stop {pendingReorder.from} to stop {pendingReorder.to}? This changes the saved route order for every week.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={confirmReorder} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-2.5 rounded-lg">Save new order</button>
              <button onClick={undoReorder} className="min-h-tap px-4 bg-cream-dark text-charcoal/60 font-body text-xs uppercase tracking-widest rounded-lg">Undo</button>
            </div>
          </div>
        )}
        <div className="md:flex-1 md:overflow-auto p-3 space-y-1.5">
          {canReorder && (
            <p className="text-[11px] text-charcoal/40 font-body px-1 pb-1">Drag stops to reorder the route.</p>
          )}
          {filtered.map((c) => {
            const draggable = canReorder && c.route_seq != null;
            return (
            <button
              key={c.id}
              data-route-id={draggable ? c.id : undefined}
              onClick={() => { if (movedRef.current) { movedRef.current = false; return; } setSelectedId(c.id); setAdding(false); }}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedId === c.id ? "bg-green-primary/5 border-green-primary/30" : "bg-cream border-cream-dark"} ${dragId === c.id ? "opacity-50 ring-2 ring-green-primary/40" : ""}`}
            >
              {draggable && (
                <span
                  onPointerDown={(e) => onHandleDown(e, c.id)}
                  onPointerMove={(e) => onHandleMove(e, c.id)}
                  onPointerUp={(e) => onHandleUp(e, c.id)}
                  className="shrink-0 -ml-1 px-1 text-charcoal/40 text-base leading-none cursor-grab active:cursor-grabbing select-none"
                  style={{ touchAction: "none" }}
                  aria-label="Drag to reorder"
                >⋮⋮</span>
              )}
              {sort === "route" && (
                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-body ${c.route_seq != null ? "bg-green-primary text-cream" : "bg-cream-dark text-charcoal/40"}`}>
                  {c.route_seq != null ? Math.round(c.route_seq) : "·"}
                </span>
              )}
              {sort === "route" && c.delivery_day && (
                <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-body font-semibold ${c.delivery_day === "wednesday" ? "bg-gold-primary/25 text-gold-dark" : "bg-green-primary/10 text-green-primary"}`} title={c.delivery_day === "wednesday" ? "Wednesday run (east)" : "Thursday run (west)"}>
                  {c.delivery_day === "wednesday" ? "W" : "T"}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {(c.tags ?? []).includes("VIP") && <span className="text-gold-primary text-sm">★</span>}
                  <span className="font-body font-medium text-charcoal truncate">{c.name}</span>
                </div>
                <p className="text-xs text-charcoal/40 font-body truncate">{c.address}</p>
              </div>
              {lastDelivered(c.id) && (
                <span className="text-[11px] text-charcoal/40 font-body shrink-0">{fmtDate(lastDelivered(c.id)!)}</span>
              )}
            </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-charcoal/40 font-body py-8 text-sm">No customers match.</p>
          )}
        </div>
      </div>

      {/* Detail / Add */}
      <div className={`${selected || adding ? "block" : "hidden md:block"} flex-1 md:overflow-auto`}>
        {adding ? (
          <AddForm
            onCancel={() => setAdding(false)}
            onCreated={(c) => { setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); setSelectedId(c.id); }}
          />
        ) : selected ? (
          <Detail
            key={selected.id}
            c={selected}
            activity={activity[selected.id] ?? []}
            onBack={() => setSelectedId(null)}
            onPatch={(p) => patch(selected.id, p)}
            onDelete={() => { setCustomers((cs) => cs.filter((x) => x.id !== selected.id)); setSelectedId(null); startTransition(() => { deleteCustomer(selected.id); }); }}
            pending={startTransition}
          />
        ) : (
          <div className="hidden md:flex h-full items-center justify-center text-charcoal/30 font-body">
            Select a customer
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({
  c, activity, onBack, onPatch, onDelete, pending,
}: {
  c: Customer;
  activity: Activity[];
  onBack: () => void;
  onPatch: (p: Partial<Customer>) => void;
  onDelete: () => void;
  pending: (fn: () => void) => void;
}) {
  const [gate, setGate] = useState(c.gate_code ?? "");
  const [notes, setNotes] = useState(c.delivery_notes ?? "");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const tags = c.tags ?? [];
  const dirty = gate !== (c.gate_code ?? "") || notes !== (c.delivery_notes ?? "");

  // Route positioning: where does this customer fall in the master route?
  const [pos, setPos] = useState<RoutePositioning | null>(null);
  const [posBusy, setPosBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setPos(null);
    getRoutePositioning(c.id).then((r) => { if (live) setPos(r); }).catch(() => {});
    return () => { live = false; };
  }, [c.id]);

  function confirmPosition() {
    if (!pos?.suggestion) return;
    const seq = pos.suggestion.seq;
    setPosBusy(true);
    saveRoutePosition(c.id, seq).then(() => {
      setPos((p) => (p ? { ...p, current: seq, suggestion: null } : p));
    }).finally(() => setPosBusy(false));
  }

  const posMapStops: RouteStop[] = (() => {
    if (!pos) return [];
    const master = pos.masterRoute;
    const list = pos.suggestion
      ? [
          ...master.slice(0, pos.suggestion.index),
          { id: c.id, name: c.name, lat: pos.suggestion.lat, lng: pos.suggestion.lng },
          ...master.slice(pos.suggestion.index),
        ]
      : master;
    return list.map((s, i) => ({
      id: s.id,
      stop_order: i + 1,
      status: "pending",
      customer: { name: s.name, address: "", lat: s.lat, lng: s.lng },
    })) as unknown as RouteStop[];
  })();

  function toggleTag(t: string) {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    onPatch({ tags: next });
    pending(() => saveCustomerTags(c.id, next));
  }
  async function saveNotes() {
    onPatch({ gate_code: gate.trim() || null, delivery_notes: notes.trim() || null });
    await saveCustomerNotes(c.id, { gate_code: gate.trim() || null, delivery_notes: notes.trim() || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (editing) {
    return (
      <EditCustomer
        c={c}
        onCancel={() => setEditing(false)}
        onSaved={(f) => { onPatch(f); setEditing(false); }}
      />
    );
  }

  return (
    <div className="p-5 md:p-8 md:max-w-2xl space-y-5">
      <button onClick={onBack} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-3xl font-light text-charcoal">{c.name}</h2>
          <div className="shrink-0 flex items-center gap-2">
            {c.account_type && (
              <span className={`text-[11px] font-body uppercase tracking-wider px-2.5 py-1 rounded-full ${c.account_type === "Delivery" ? "bg-green-primary/10 text-green-primary" : "bg-gold-primary/20 text-gold-dark"}`}>
                {c.account_type}
              </span>
            )}
            <button
              onClick={() => setEditing(true)}
              className="min-h-tap px-3 py-1.5 rounded-lg border border-cream-dark bg-cream text-charcoal/60 text-xs font-body uppercase tracking-widest"
            >
              ✎ Edit
            </button>
          </div>
        </div>
        {c.spot_account && <p className="text-xs text-charcoal/40 font-body mt-0.5">SPOT {c.spot_account}</p>}
      </div>

      <div className="space-y-2">
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-green-primary font-body underline underline-offset-2">{c.address}</a>
        {c.phone && <a href={`tel:${c.phone}`} className="block text-sm text-charcoal/70 font-body">📞 {c.phone}</a>}
      </div>

      {/* Route position */}
      {pos?.ok && (pos.current != null || pos.suggestion || pos.noCoords) && (
        <div>
          <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Route Position</p>
          {pos.current != null ? (
            <div className="bg-cream rounded-xl border border-cream-dark p-3">
              <p className="text-sm font-body text-charcoal mb-2">In the route, position {Math.round(pos.current)}.</p>
              {posMapStops.length > 0 && (
                <div className="relative h-44 rounded-lg overflow-hidden border border-cream-dark">
                  <RouteMap stops={posMapStops} targetId={c.id} onSelect={() => {}} />
                </div>
              )}
            </div>
          ) : pos.suggestion ? (
            <div className="bg-cream rounded-xl border border-cream-dark p-3">
              <p className="text-sm font-body text-charcoal">
                Suggested spot
                {pos.suggestion.before && pos.suggestion.after ? (
                  <>, between <b>{pos.suggestion.before}</b> &amp; <b>{pos.suggestion.after}</b></>
                ) : pos.suggestion.before ? (
                  <>, after <b>{pos.suggestion.before}</b></>
                ) : pos.suggestion.after ? (
                  <>, before <b>{pos.suggestion.after}</b></>
                ) : null}.
              </p>
              <div className="relative h-44 mt-3 rounded-lg overflow-hidden border border-cream-dark">
                <RouteMap stops={posMapStops} targetId={c.id} onSelect={() => {}} suggestedIds={[c.id]} />
              </div>
              <button onClick={confirmPosition} disabled={posBusy} className="w-full mt-3 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
                {posBusy ? "Saving…" : "Confirm this spot"}
              </button>
            </div>
          ) : pos.noCoords ? (
            <p className="text-sm text-charcoal/40 font-body">No location on file, so we can&apos;t suggest a route spot.</p>
          ) : null}
        </div>
      )}

      {/* Delivery day: Wednesday = east of the shop, Thursday = west */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Delivery Day</p>
        <div className="flex gap-2">
          {(["wednesday", "thursday"] as const).map((d) => (
            <button
              key={d}
              onClick={() => { const next = c.delivery_day === d ? null : d; onPatch({ delivery_day: next }); pending(() => { setDeliveryDay(c.id, next); }); }}
              className={`flex-1 min-h-tap py-2.5 rounded-lg text-xs font-body uppercase tracking-widest border ${c.delivery_day === d ? "bg-green-primary border-green-primary text-cream" : "bg-cream border-cream-dark text-charcoal/50"}`}
            >
              {d === "wednesday" ? "Wednesday · East" : "Thursday · West"}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Tags</p>
        <div className="flex gap-2 flex-wrap">
          {TAGS.map((t) => (
            <button key={t} onClick={() => toggleTag(t)} className={`px-3 py-1.5 rounded-full text-xs font-body ${tags.includes(t) ? "bg-gold-primary text-charcoal" : "bg-cream-dark text-charcoal/50"}`}>
              {tags.includes(t) ? "★ " : ""}{t}
            </button>
          ))}
        </div>
      </div>

      {/* Gate + notes (editable) */}
      <div className="bg-gold-primary/10 border border-gold-primary/30 rounded-xl p-3">
        <label className="text-xs text-gold-dark font-body uppercase tracking-widest block mb-1">Gate Code</label>
        <input value={gate} onChange={(e) => setGate(e.target.value)} placeholder="None on file" className="w-full bg-transparent text-xl font-body font-semibold text-charcoal tracking-wider focus:outline-none placeholder:text-base placeholder:font-normal placeholder:text-charcoal/30" />
      </div>
      <div className="bg-green-primary/5 border border-green-primary/20 rounded-xl p-3">
        <label className="text-xs text-green-primary font-body uppercase tracking-widest block mb-1">Standing Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Delivery preferences, access, etc." className="w-full bg-transparent text-sm font-body text-charcoal resize-none focus:outline-none placeholder:text-charcoal/30" />
      </div>
      {dirty && (
        <button onClick={saveNotes} className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg">Save</button>
      )}
      {saved && <p className="text-center text-xs text-green-primary font-body">✓ Saved</p>}

      {/* Recent activity */}
      <div>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">Recent Activity</p>
        {activity.length === 0 ? (
          <p className="text-sm text-charcoal/40 font-body">No deliveries yet.</p>
        ) : (
          <div className="space-y-2">
            {activity.slice(0, 6).map((a, i) => (
              <div key={i} className="bg-cream rounded-lg border border-cream-dark p-3">
                <div className="flex items-center gap-2 text-sm font-body text-charcoal">
                  <span className="text-charcoal/50">{new Date(a.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                  {a.dropoff && <span className="text-xs text-green-primary">↓ Drop</span>}
                  {a.pickup && <span className="text-xs text-gold-dark">↑ Pick</span>}
                  {a.pieces > 0 && <span className="text-xs text-charcoal/40">{a.pieces} pcs</span>}
                </div>
                {a.photos.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {a.photos.map((u, j) => (
                      <a key={j} href={u} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="proof" className="w-16 h-16 object-cover rounded-md border border-cream-dark" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => { if (confirm(`Remove ${c.name}?`)) onDelete(); }} className="text-xs text-red-400 font-body uppercase tracking-widest">Remove customer</button>
    </div>
  );
}

function EditCustomer({
  c, onCancel, onSaved,
}: {
  c: Customer;
  onCancel: () => void;
  onSaved: (fields: Partial<Customer>) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const address = (fd.get("address") as string).trim();
    const phone = (fd.get("phone") as string).trim();
    start(async () => {
      const res = await updateCustomer(c.id, { name, address, phone: phone || undefined });
      if (res.error) { setError(res.error); return; }
      onSaved({ name, address, phone: phone || null });
    });
  }

  const field = "w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";
  const label = "text-[11px] text-charcoal/40 font-body uppercase tracking-widest block mb-1";

  return (
    <form onSubmit={submit} className="p-5 md:p-8 md:max-w-2xl space-y-3">
      <button type="button" onClick={onCancel} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>
      <h2 className="font-serif text-2xl font-light text-charcoal">Edit {c.name}</h2>
      <div>
        <span className={label}>Name</span>
        <input name="name" defaultValue={c.name} required className={field} />
      </div>
      <div>
        <span className={label}>Address</span>
        <input name="address" defaultValue={c.address} required className={field} />
        <p className="text-[11px] text-charcoal/40 font-body mt-1">Changing the address re-pins them on the map.</p>
      </div>
      <div>
        <span className={label}>Phone</span>
        <input name="phone" defaultValue={c.phone ?? ""} className={field} />
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

function AddForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: Customer) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createCustomer({
        name: fd.get("name") as string,
        address: fd.get("address") as string,
        phone: (fd.get("phone") as string) || undefined,
        gate_code: (fd.get("gate_code") as string) || undefined,
        delivery_notes: (fd.get("delivery_notes") as string) || undefined,
      });
      if (res.error) setError(res.error);
      else if (res.customer) onCreated(res.customer as Customer);
    });
  }
  return (
    <form onSubmit={submit} className="p-5 md:p-8 md:max-w-2xl space-y-3">
      <button type="button" onClick={onCancel} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>
      <h2 className="font-serif text-2xl font-light text-charcoal">New Customer</h2>
      {["name", "address"].map((n) => (
        <input key={n} name={n} placeholder={n[0].toUpperCase() + n.slice(1)} required className="w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary" />
      ))}
      <input name="phone" placeholder="Phone (optional)" className="w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary" />
      <input name="gate_code" placeholder="Gate code (optional)" className="w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary" />
      <textarea name="delivery_notes" placeholder="Notes (optional)" rows={2} className="w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary" />
      {error && <p className="text-sm text-red-600 font-body">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg">{pending ? "Adding…" : "Add Customer"}</button>
        <button type="button" onClick={onCancel} className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest">Cancel</button>
      </div>
    </form>
  );
}
