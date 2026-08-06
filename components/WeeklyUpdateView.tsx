"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { renderWeeklyUpdate } from "@/lib/weeklyUpdate";
import {
  saveWeeklyUpdate,
  addActionItem,
  setActionItemDone,
  removeActionItem,
  type ActionItemRow,
  type WeeklyUpdateRow,
} from "@/lib/actions/weekly";

export interface WeeklyPageData {
  weekStart: string;
  todayIso: string;
  openIssues: number;
  newIssues: number;
  resolvedIssues: number;
  activeOpportunities: number;
  touchpointsThisWeek: number;
  saved: WeeklyUpdateRow | null;
  actionItems: ActionItemRow[];
  needsMigration: boolean;
}

const RAG = ["Green", "Yellow", "Red"];
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9.-]/g, "")));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-body uppercase tracking-widest text-charcoal/40 mb-1">{label}</span>
      {children}
    </label>
  );
}
const inputCls =
  "w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";

export default function WeeklyUpdateView({ data }: { data: WeeklyPageData }) {
  const s = data.saved;
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");

  // Revenue: weekly + YTD + prior-year YTD, because the format demands both
  // comparisons on every line.
  const [swWeek, setSwWeek] = useState(String(s?.sweetwater_revenue ?? ""));
  const [swYtd, setSwYtd] = useState(String(s?.sweetwater_ytd ?? ""));
  const [swPrior, setSwPrior] = useState(String(s?.sweetwater_ytd_prior ?? ""));
  const [jrsWeek, setJrsWeek] = useState(String(s?.jrs_revenue ?? ""));
  const [jrsYtd, setJrsYtd] = useState(String(s?.jrs_ytd ?? ""));
  const [jrsPrior, setJrsPrior] = useState(String(s?.jrs_ytd_prior ?? ""));
  const [delWeek, setDelWeek] = useState(String(s?.delivery_revenue ?? ""));
  const [delYtd, setDelYtd] = useState(String(s?.delivery_ytd ?? ""));

  const [staffing, setStaffing] = useState(s?.staffing_status ?? "Green");
  const [staffingNote, setStaffingNote] = useState(s?.staffing_note ?? "");
  const [equipment, setEquipment] = useState(s?.equipment_status ?? "Green");
  const [equipmentNote, setEquipmentNote] = useState(s?.equipment_note ?? "");
  // No longer read from the saved row — these two fields were retired from
  // the writable form (saveWeeklyUpdate no longer accepts them) but this
  // legacy screen isn't reachable anymore (middleware routes both Owner and
  // Manager to the Ops Hub's Weekly Update instead); left as static defaults
  // so this file keeps compiling rather than deleting a page still on disk.
  const [blocking, setBlocking] = useState("None");
  const [keyUpdates, setKeyUpdates] = useState(s?.key_updates ?? "");
  const [expectation, setExpectation] = useState("");

  const [newOwner, setNewOwner] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newSection, setNewSection] = useState<"operations" | "growth">("operations");

  const preview = useMemo(
    () =>
      renderWeeklyUpdate({
        date: new Date(data.todayIso),
        openIssues: data.openIssues,
        newIssues: data.newIssues,
        resolvedIssues: data.resolvedIssues,
        expectationNote: expectation,
        staffingStatus: staffing,
        staffingNote,
        equipmentStatus: equipment,
        equipmentNote,
        blockingGrowth: blocking,
        keyUpdates,
        sweetwater: { weekly: num(swWeek), ytd: num(swYtd), ytdPrior: num(swPrior) },
        jrs: { weekly: num(jrsWeek), ytd: num(jrsYtd), ytdPrior: num(jrsPrior) },
        delivery: { weekly: num(delWeek), ytd: num(delYtd), ytdPrior: null, sweetwaterYtd: num(swYtd) },
        activeOpportunities: data.activeOpportunities,
        touchpointsThisWeek: data.touchpointsThisWeek,
        actionItems: data.actionItems.map((a) => ({
          owner: a.owner,
          action: a.action,
          section: a.section,
          completedThisWeek: a.completed_week === data.weekStart,
        })),
      }),
    [data, expectation, staffing, staffingNote, equipment, equipmentNote, blocking, keyUpdates,
     swWeek, swYtd, swPrior, jrsWeek, jrsYtd, jrsPrior, delWeek, delYtd]
  );

  function save() {
    setErr("");
    start(async () => {
      const res = await saveWeeklyUpdate({
        week_start: data.weekStart,
        sweetwater_revenue: num(swWeek), jrs_revenue: num(jrsWeek), delivery_revenue: num(delWeek),
        sweetwater_ytd: num(swYtd), jrs_ytd: num(jrsYtd), delivery_ytd: num(delYtd),
        sweetwater_ytd_prior: num(swPrior), jrs_ytd_prior: num(jrsPrior), delivery_ytd_prior: null,
        staffing_status: staffing, staffing_note: staffingNote,
        equipment_status: equipment, equipment_note: equipmentNote,
        key_updates: keyUpdates,
      });
      if (res?.error) setErr(res.error);
    });
  }

  return (
    <div className="p-5 md:p-8 md:max-w-6xl md:mx-auto">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
        ← Dispatch
      </Link>
      <h2 className="font-serif text-2xl font-light text-charcoal mb-1">Weekly update</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-5">
        Week of {new Date(data.weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}
      </p>

      {data.needsMigration && (
        <div className="bg-gold-primary/10 border border-gold-primary/40 rounded-xl px-4 py-3 mb-5">
          <p className="font-body text-[12.5px] text-charcoal">
            Run <b>supabase/weekly_updates.sql</b> to save updates and action items. Everything below
            still previews correctly, it just won&apos;t persist yet.
          </p>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        {/* ── Inputs ── */}
        <div className="space-y-6">
          {/* Pulled from live data */}
          <section className="bg-cream rounded-xl border border-cream-dark p-4">
            <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/40 mb-3">
              From the app
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                ["Open issues", data.openIssues],
                ["New", data.newIssues],
                ["Resolved", data.resolvedIssues],
                ["Touchpoints", data.touchpointsThisWeek],
              ].map(([l, v]) => (
                <div key={String(l)}>
                  <div className="font-serif text-2xl font-light text-charcoal">{v}</div>
                  <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide">{l}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-charcoal/40 font-body mt-3">
              Customer issues come from the exception log, touchpoints and {data.activeOpportunities} active
              opportunities from Prospects. Nothing to retype.
            </p>
          </section>

          {/* Revenue */}
          <section className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3">
            <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/40">Revenue</h3>
            <p className="text-[11px] text-charcoal/45 font-body">
              Enter weekly and YTD; the percentages and dollar gaps are calculated (goal is prior year
              x1.15 for Sweetwater, x1.16 for JRS, 10% share for delivery).
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="SW week"><input value={swWeek} onChange={(e) => setSwWeek(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="SW YTD"><input value={swYtd} onChange={(e) => setSwYtd(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="SW YTD prior"><input value={swPrior} onChange={(e) => setSwPrior(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="JRS week"><input value={jrsWeek} onChange={(e) => setJrsWeek(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="JRS YTD"><input value={jrsYtd} onChange={(e) => setJrsYtd(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="JRS YTD prior"><input value={jrsPrior} onChange={(e) => setJrsPrior(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="Delivery week"><input value={delWeek} onChange={(e) => setDelWeek(e.target.value)} className={inputCls} placeholder="$" /></Field>
              <Field label="Delivery YTD"><input value={delYtd} onChange={(e) => setDelYtd(e.target.value)} className={inputCls} placeholder="$" /></Field>
            </div>
          </section>

          {/* Operations */}
          <section className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3">
            <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/40">Operations</h3>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Staffing">
                <select value={staffing} onChange={(e) => setStaffing(e.target.value)} className={inputCls}>
                  {RAG.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Staffing note"><input value={staffingNote} onChange={(e) => setStaffingNote(e.target.value)} className={inputCls} /></Field>
              <Field label="Equipment">
                <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={inputCls}>
                  {RAG.map((r) => <option key={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Equipment note"><input value={equipmentNote} onChange={(e) => setEquipmentNote(e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Blocking growth"><input value={blocking} onChange={(e) => setBlocking(e.target.value)} className={inputCls} placeholder="None" /></Field>
            <Field label="Key updates (one per line)">
              <textarea value={keyUpdates} onChange={(e) => setKeyUpdates(e.target.value)} rows={3} className={inputCls} />
            </Field>
            <Field label="Expectation missed (leave blank if met)">
              <input value={expectation} onChange={(e) => setExpectation(e.target.value)} className={inputCls} placeholder="Only fill when an expectation was not met" />
            </Field>
          </section>

          {/* Action items */}
          <section className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3">
            <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/40">Action items</h3>
            <div className="space-y-1.5">
              {data.actionItems.length === 0 && (
                <p className="text-[12px] text-charcoal/40 font-body">None open.</p>
              )}
              {data.actionItems.map((a) => {
                const done = a.completed_week === data.weekStart;
                return (
                  <div key={a.id} className="flex items-center gap-2 text-[12.5px] font-body">
                    <button
                      onClick={() => start(async () => { await setActionItemDone(a.id, data.weekStart, !done); })}
                      className={`shrink-0 w-4 h-4 rounded border ${done ? "bg-green-primary border-green-primary" : "border-charcoal/25"}`}
                      title={done ? "Reopen" : "Mark completed"}
                    />
                    <span className={`flex-1 min-w-0 ${done ? "line-through text-charcoal/40" : "text-charcoal"}`}>
                      <b>{a.owner}</b>: {a.action}
                      {a.opened_week !== data.weekStart && !done && (
                        <span className="text-charcoal/35"> · carried over</span>
                      )}
                    </span>
                    <button onClick={() => start(async () => { await removeActionItem(a.id); })} className="shrink-0 text-charcoal/25 hover:text-red-500">✕</button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Owner" className={`${inputCls} w-28`} />
              <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Action" className={`${inputCls} flex-1`} />
              <select value={newSection} onChange={(e) => setNewSection(e.target.value as "operations" | "growth")} className={`${inputCls} w-28`}>
                <option value="operations">Ops</option>
                <option value="growth">Growth</option>
              </select>
              <button
                disabled={!newOwner.trim() || !newAction.trim() || pending}
                onClick={() => start(async () => {
                  await addActionItem({ owner: newOwner, action: newAction, section: newSection, openedWeek: data.weekStart });
                  setNewOwner(""); setNewAction("");
                })}
                className="shrink-0 px-3 bg-green-primary text-cream rounded-lg font-body text-xs uppercase tracking-widest disabled:opacity-40"
              >
                Add
              </button>
            </div>
            <p className="text-[11px] text-charcoal/40 font-body">
              Owners are named people. Open items carry over automatically; completed ones show as
              (Completed) this week, then drop off next week.
            </p>
          </section>

          <div className="flex gap-2">
            <button onClick={save} disabled={pending} className="flex-1 min-h-tap bg-green-primary text-cream rounded-xl font-body text-xs uppercase tracking-widest disabled:opacity-50">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
          {err && <p className="text-[12px] text-red-600 font-body">{err}</p>}
        </div>

        {/* ── Live preview ── */}
        <div className="mt-6 lg:mt-0 lg:sticky lg:top-6">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/40">Preview</h3>
            <button
              onClick={() => { void navigator.clipboard.writeText(preview); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
              className="font-body text-xs text-green-primary uppercase tracking-widest"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="bg-cream border border-cream-dark rounded-xl p-4 text-[12px] font-mono text-charcoal whitespace-pre-wrap overflow-x-auto lg:max-h-[75vh] lg:overflow-y-auto">
{preview}
          </pre>
        </div>
      </div>
    </div>
  );
}
