"use client";

import { useState, useTransition } from "react";
import {
  createProspect,
  updateProspect,
  logTouchpoint,
  deleteProspect,
  convertProspectToCustomer,
} from "@/lib/actions/prospects";
import ProspectMap, { pinColor } from "@/components/ProspectMap";
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
  { id: "call", label: "Call", icon: "📞" },
  { id: "email", label: "Email", icon: "✉️" },
  { id: "text", label: "Text", icon: "💬" },
  { id: "visit", label: "Visit", icon: "🚪" },
  { id: "note", label: "Note", icon: "📝" },
];

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

export default function ProspectDirectory({ prospects: initial }: { prospects: Prospect[] }) {
  const [prospects, setProspects] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ProspectStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [, startTransition] = useTransition();

  // Active pipeline first, sorted by longest-since-last-touch so the coldest
  // prospects surface at the top of the call list.
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
      if (closed(a.status) !== closed(b.status)) return closed(a.status) ? 1 : -1;
      const at = lastTouch(a);
      const bt = lastTouch(b);
      if (!at && !bt) return a.name.localeCompare(b.name);
      if (!at) return -1; // never-touched floats to the very top
      if (!bt) return 1;
      return at.localeCompare(bt);
    });

  const selected = prospects.find((p) => p.id === selectedId) || null;
  const counts = STATUSES.map((s) => ({ ...s, n: prospects.filter((p) => p.status === s.id).length }));

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
        </div>
        <div className="md:flex-1 md:overflow-auto p-3 space-y-1.5">
          {filtered.map((p) => {
            const days = daysSince(lastTouch(p));
            const cold = !closed(p.status) && (days == null || days > 30);
            return (
              <button
                key={p.id}
                onClick={() => { setSelectedId(p.id); setAdding(false); }}
                className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${selectedId === p.id ? "bg-green-primary/5 border-green-primary/30" : "bg-cream border-cream-dark"}`}
              >
                <span className="shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: pinColor(p.status) }} />
                <div className="flex-1 min-w-0">
                  <span className="font-body font-medium text-charcoal truncate block">{p.name}</span>
                  <p className="text-xs text-charcoal/40 font-body truncate">
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

      {/* Detail / Add */}
      <div className={`${selected || adding ? "block" : "hidden md:block"} flex-1 md:overflow-auto`}>
        {adding ? (
          <AddForm
            onCancel={() => setAdding(false)}
            onCreated={(p) => {
              setProspects((ps) => [...ps, { ...p, touchpoints: [] }]);
              setAdding(false);
              setSelectedId(p.id);
            }}
          />
        ) : selected ? (
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
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
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
    onPatch({ status });
    startTransition(() => { updateProspect(p.id, { status }); });
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
    const res = await logTouchpoint(p.id, touchType, touchNote);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    const tp = res.touchpoint as ProspectTouchpoint;
    onPatch({
      touchpoints: [tp, ...(p.touchpoints ?? [])],
      ...(p.status === "new" ? { status: "working" as ProspectStatus } : {}),
    });
    setTouchType(null);
    setTouchNote("");
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
    if (res.error) { setError(res.error); return; }
    onPatch({ status: "active", customer_id: res.customer.id });
  }

  return (
    <div className="p-5 md:p-8 md:max-w-2xl space-y-5">
      <button onClick={onBack} className="md:hidden text-sm text-charcoal/50 font-body">← Back</button>

      <div>
        <h2 className="font-serif text-3xl font-light text-charcoal">{p.name}</h2>
        <p className="text-xs text-charcoal/40 font-body mt-0.5">{typeLabel(p.business_type)}</p>
      </div>

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
            <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">They Buy</p>
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
        {p.phone && <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`} className="block text-sm text-green-primary font-body">📞 {p.phone}</a>}
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
            {(p.touchpoints ?? []).slice(0, 12).map((t) => (
              <div key={t.id} className="bg-cream rounded-lg border border-cream-dark p-3">
                <div className="flex items-center gap-2 text-sm font-body text-charcoal">
                  <span>{TOUCH_TYPES.find((x) => x.id === t.type)?.icon}</span>
                  <span className="capitalize">{t.type}</span>
                  <span className="text-charcoal/40 text-xs ml-auto">{fmtDate(t.created_at)}</span>
                </div>
                {t.note && <p className="text-xs text-charcoal/60 font-body mt-1">{t.note}</p>}
              </div>
            ))}
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
