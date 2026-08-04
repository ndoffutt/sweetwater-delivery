"use client";

// Reports — the weekly update is the front page; action items and past updates
// live beside it. The update follows the company's mandated format exactly
// (Sweetwaters_brain/wiki/operations.md): the revenue table carries four
// labelled values on every line, every time. That rule exists because an
// unlabelled single number once made a business running +15% read as flat.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SubNav, Reg, Tag, btnPrimary, btnSecondary, inputCls, Kicker } from "@/components/ops/Bits";
import {
  saveWeeklyUpdate,
  submitWeeklyUpdate,
  addActionItem,
  setActionItemDone,
  removeActionItem,
  addReportComment,
  type ReportCommentRow,
} from "@/lib/actions/weekly";
import type { OpenActionItem, WeeklyRow } from "@/lib/opsData";
import { renderWeeklyUpdate, GOAL_MULTIPLIER, DELIVERY_GOAL_PCT } from "@/lib/weeklyUpdate";

export interface ReportsData {
  weekStart: string;
  userName: string;
  weekly: WeeklyRow | null;
  items: OpenActionItem[];
  issues: { open: number; newThisWeek: number; resolved: number };
  activeOpportunities: number;
  touchpointsThisWeek: number;
  comments: ReportCommentRow[];
  pastUpdates: { week_start: string; submitted_at: string | null }[];
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9.-]/g, "")));
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const RAG = ["Green", "Yellow", "Red"] as const;

function Seg({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex border border-ops-divider">
      {RAG.map((r, i) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3.5 py-1.5 text-[13px] font-barlow ${i > 0 ? "border-l border-ops-divider" : ""} ${
            value === r
              ? r === "Green" ? "bg-ops-accent text-ops-bg" : r === "Yellow" ? "bg-ops-gold text-ops-text" : "bg-ops-danger text-ops-bg"
              : "hover:bg-[rgba(26,26,26,.07)]"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export default function ReportsHub({ data }: { data: ReportsData }) {
  const s = data.weekly;
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(!!s?.submitted_at);

  // Revenue inputs (weekly + YTD + prior YTD — the format needs all of them).
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
  const [blocking, setBlocking] = useState(s?.blocking_growth ?? "None");
  const [keyUpdates, setKeyUpdates] = useState(s?.key_updates ?? "");
  const [expectation, setExpectation] = useState(s?.expectation_note ?? "");

  const [issueOpen, setIssueOpen] = useState(String(data.issues.open));
  const [issueNew, setIssueNew] = useState(String(data.issues.newThisWeek));
  const [issueResolved, setIssueResolved] = useState(String(data.issues.resolved));

  const [newOwner, setNewOwner] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newSection, setNewSection] = useState<"operations" | "growth">("operations");
  const [items, setItems] = useState(data.items);

  const [commentBody, setCommentBody] = useState("");
  const [commentSection, setCommentSection] = useState("operations");
  const [comments, setComments] = useState(data.comments);

  // Revenue derivations — the four labelled values per line.
  const rows = useMemo(() => {
    const build = (label: string, weekS: string, ytdS: string, priorS: string, mult: number) => {
      const ytd = num(ytdS), prior = num(priorS);
      if (ytd == null || prior == null || prior === 0)
        return { label, week: num(weekS), vsPrior: null as number | null, vsGoal: null as number | null, dollar: null as number | null };
      const goal = prior * mult;
      return {
        label,
        week: num(weekS),
        vsPrior: ((ytd - prior) / prior) * 100,
        vsGoal: ((ytd - goal) / goal) * 100,
        dollar: ytd - goal,
      };
    };
    const sw = build("Sweetwater's", swWeek, swYtd, swPrior, GOAL_MULTIPLIER.sweetwater);
    const jrs = build("JRS", jrsWeek, jrsYtd, jrsPrior, GOAL_MULTIPLIER.jrs);
    const dYtd = num(delYtd), swY = num(swYtd);
    const delivery = {
      week: num(delWeek),
      share: dYtd != null && swY ? (dYtd / swY) * 100 : null,
      gap: dYtd != null && swY ? swY * (DELIVERY_GOAL_PCT / 100) - dYtd : null,
    };
    return { sw, jrs, delivery };
  }, [swWeek, swYtd, swPrior, jrsWeek, jrsYtd, jrsPrior, delWeek, delYtd]);

  const pct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(n >= 10 || n <= -10 ? 1 : 2)}%`);

  function save(then?: () => void) {
    setErr("");
    start(async () => {
      const res = await saveWeeklyUpdate({
        week_start: data.weekStart,
        sweetwater_revenue: num(swWeek), jrs_revenue: num(jrsWeek), delivery_revenue: num(delWeek),
        sweetwater_ytd: num(swYtd), jrs_ytd: num(jrsYtd), delivery_ytd: num(delYtd),
        sweetwater_ytd_prior: num(swPrior), jrs_ytd_prior: num(jrsPrior), delivery_ytd_prior: null,
        staffing_status: staffing, staffing_note: staffingNote,
        equipment_status: equipment, equipment_note: equipmentNote,
        blocking_growth: blocking, key_updates: keyUpdates, expectation_note: expectation,
      });
      if (res?.error) setErr(res.error);
      else then?.();
    });
  }

  const updateText = () =>
    renderWeeklyUpdate({
      date: new Date(),
      openIssues: num(issueOpen) ?? 0,
      newIssues: num(issueNew) ?? 0,
      resolvedIssues: num(issueResolved) ?? 0,
      expectationNote: expectation,
      staffingStatus: staffing, staffingNote,
      equipmentStatus: equipment, equipmentNote,
      blockingGrowth: blocking, keyUpdates,
      sweetwater: { weekly: num(swWeek), ytd: num(swYtd), ytdPrior: num(swPrior) },
      jrs: { weekly: num(jrsWeek), ytd: num(jrsYtd), ytdPrior: num(jrsPrior) },
      delivery: { weekly: num(delWeek), ytd: num(delYtd), ytdPrior: null, sweetwaterYtd: num(swYtd) },
      activeOpportunities: data.activeOpportunities,
      touchpointsThisWeek: data.touchpointsThisWeek,
      actionItems: items.map((a) => ({
        owner: a.owner, action: a.action, section: a.section,
        completedThisWeek: a.completed_week === data.weekStart,
      })),
    });

  const weekLabel = new Date(data.weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const commentsFor = (section: string) => comments.filter((c) => c.section === section && !c.resolved_at);

  const CommentCallout = ({ section }: { section: string }) => {
    const list = commentsFor(section);
    if (list.length === 0) return null;
    return (
      <Reg className="mt-4 bg-ops-gold-100 border border-ops-divider p-4">
        {list.map((c) => (
          <div key={c.id} className="mb-2 last:mb-0">
            <div className="text-[12.5px] text-[rgba(26,26,26,.62)]">
              {c.author} · {new Date(c.created_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </div>
            <div className="text-[15px] mt-0.5">{c.body}</div>
          </div>
        ))}
      </Reg>
    );
  };

  return (
    <>
      <SubNav
        items={[
          { label: "Weekly update", href: "/reports", active: true },
          { label: "Action items", href: "/reports#items", count: items.filter((i) => !i.completed_week).length },
          { label: "Revenue", href: "/dispatch/reports" },
          { label: "Delivery volume", href: "/dispatch/reports" },
          { label: "Route efficiency", href: "/dispatch/route-plan" },
        ]}
      />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12">
        {/* Title */}
        <div className="pt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">
              Weekly Update — {weekLabel}
            </h1>
            <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
              {submitted ? "Submitted" : "Draft"} by {data.userName} · due Friday 8:00
              {commentsFor("operations").length + commentsFor("issues").length + commentsFor("growth").length > 0 &&
                ` · ${comments.filter((c) => !c.resolved_at).length} open comment${comments.filter((c) => !c.resolved_at).length === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={() => { void navigator.clipboard.writeText(updateText()); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
              {copied ? "Copied" : "Copy as text"}
            </button>
            <Reg>
              <button
                className={btnPrimary}
                disabled={pending || submitted}
                onClick={() => save(() => { start(async () => { const r = await submitWeeklyUpdate(data.weekStart); if (!r?.error) setSubmitted(true); else setErr(r.error); }); })}
              >
                {submitted ? "Submitted" : "Submit"}
              </button>
            </Reg>
          </div>
        </div>
        {err && <p className="mt-2 text-[13px] text-ops-danger">{err}</p>}

        <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-14 mt-2">
          {/* ── The update ── */}
          <div>
            {/* 1 · Customer Issues */}
            <section className="mt-7 border-t-2 border-ops-text pt-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold text-[24px] leading-none">
                  <span className="text-[rgba(26,26,26,.5)] mr-3">1</span>Customer Issues
                </h2>
                <Tag tone="neutral">auto-filled from the exception log</Tag>
              </div>
              <div className="mt-4 flex gap-6">
                {[
                  ["Open", issueOpen, setIssueOpen],
                  ["New this week", issueNew, setIssueNew],
                  ["Resolved", issueResolved, setIssueResolved],
                ].map(([label, v, set]) => (
                  <label key={label as string} className="block">
                    <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">{label as string}</span>
                    <input value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className={`${inputCls} w-[76px] text-center`} />
                  </label>
                ))}
              </div>
              <label className="block mt-4">
                <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Expectation missed (leave blank if met)</span>
                <input value={expectation} onChange={(e) => setExpectation(e.target.value)} className={inputCls} />
              </label>
              <CommentCallout section="issues" />
            </section>

            {/* 2 · Operations */}
            <section className="mt-8 border-t-2 border-ops-text pt-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold text-[24px] leading-none">
                  <span className="text-[rgba(26,26,26,.5)] mr-3">2</span>Operations
                </h2>
                {commentsFor("operations").length > 0 && <Tag tone="gold">{commentsFor("operations").length} comment{commentsFor("operations").length === 1 ? "" : "s"} open</Tag>}
              </div>
              <div className="mt-4 flex flex-wrap gap-8">
                <div>
                  <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Staffing</span>
                  <Seg value={staffing ?? "Green"} onChange={setStaffing} />
                </div>
                <div>
                  <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Equipment</span>
                  <Seg value={equipment ?? "Green"} onChange={setEquipment} />
                </div>
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Staffing note</span>
                  <input value={staffingNote ?? ""} onChange={(e) => setStaffingNote(e.target.value)} className={inputCls} />
                </label>
                <label className="block">
                  <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Equipment note</span>
                  <input value={equipmentNote ?? ""} onChange={(e) => setEquipmentNote(e.target.value)} className={inputCls} />
                </label>
              </div>
              <label className="block mt-4">
                <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Operations blocking growth</span>
                <input value={blocking ?? ""} onChange={(e) => setBlocking(e.target.value)} className={inputCls} />
              </label>
              <label className="block mt-4">
                <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Key updates (one per line)</span>
                <textarea value={keyUpdates ?? ""} onChange={(e) => setKeyUpdates(e.target.value)} rows={3} className={inputCls} />
              </label>
              <CommentCallout section="operations" />
            </section>

            {/* 3 · Growth */}
            <section className="mt-8 border-t-2 border-ops-text pt-4 mb-10">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold text-[24px] leading-none">
                  <span className="text-[rgba(26,26,26,.5)] mr-3">3</span>Growth
                </h2>
                <Tag tone="accent">four values per line, always</Tag>
              </div>
              {/* Inputs */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["SW week", swWeek, setSwWeek], ["SW YTD", swYtd, setSwYtd], ["SW YTD prior", swPrior, setSwPrior],
                  ["JRS week", jrsWeek, setJrsWeek], ["JRS YTD", jrsYtd, setJrsYtd], ["JRS YTD prior", jrsPrior, setJrsPrior],
                  ["Delivery week", delWeek, setDelWeek], ["Delivery YTD", delYtd, setDelYtd],
                ].map(([label, v, set]) => (
                  <label key={label as string} className="block">
                    <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">{label as string}</span>
                    <input value={v as string} onChange={(e) => (set as (s: string) => void)(e.target.value)} className={inputCls} placeholder="$" />
                  </label>
                ))}
              </div>
              {/* Derived table */}
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead>
                    <tr className="border-b border-ops-divider">
                      {["", "Week", "YTD vs prior yr", "YTD vs goal", "$ vs goal"].map((h) => (
                        <th key={h} className="text-left font-barlowc font-semibold uppercase text-[11px] tracking-[0.08em] text-[rgba(26,26,26,.62)] py-2 pr-4 last:text-right last:pr-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[rows.sw, rows.jrs].map((r) => (
                      <tr key={r.label} className="border-b border-[rgba(26,26,26,.08)]">
                        <td className="py-2.5 pr-4">{r.label}</td>
                        <td className="py-2.5 pr-4">{money(r.week)}</td>
                        <td className={`py-2.5 pr-4 ${r.vsPrior != null && r.vsPrior >= 0 ? "text-ops-accent" : r.vsPrior != null ? "text-ops-danger" : ""}`}>{pct(r.vsPrior)}</td>
                        <td className={`py-2.5 pr-4 ${r.vsGoal != null && r.vsGoal >= 0 ? "text-ops-accent" : r.vsGoal != null ? "text-ops-danger" : ""}`}>{pct(r.vsGoal)}</td>
                        <td className={`py-2.5 text-right ${r.dollar != null && r.dollar >= 0 ? "text-ops-accent" : r.dollar != null ? "text-ops-danger" : ""}`}>
                          {r.dollar == null ? "—" : `${r.dollar >= 0 ? "+" : "−"}$${Math.abs(Math.round(r.dollar)).toLocaleString()}`}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b border-[rgba(26,26,26,.08)]">
                      <td className="py-2.5 pr-4">Delivery</td>
                      <td className="py-2.5 pr-4">{money(rows.delivery.week)}</td>
                      <td className="py-2.5 pr-4 text-[rgba(26,26,26,.68)]">{rows.delivery.share == null ? "—" : `${rows.delivery.share.toFixed(1)}% YTD`}</td>
                      <td className="py-2.5 pr-4 text-ops-gold-deep">goal {DELIVERY_GOAL_PCT}%</td>
                      <td className="py-2.5 text-right text-ops-danger">
                        {rows.delivery.gap == null ? "—" : rows.delivery.gap > 0 ? `−$${Math.abs(Math.round(rows.delivery.gap)).toLocaleString()}` : `+$${Math.abs(Math.round(rows.delivery.gap)).toLocaleString()}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[15px]">
                Active opportunities <b>{data.activeOpportunities}</b>
                <span className="ml-6">Touchpoints this week <b>{data.touchpointsThisWeek}</b></span>
              </p>
              <CommentCallout section="growth" />
              <div className="mt-5 flex gap-2">
                <button className={btnSecondary} disabled={pending} onClick={() => save()}>
                  {pending ? "Saving…" : "Save draft"}
                </button>
              </div>
            </section>

            {/* Leave a comment */}
            <section className="border-t border-ops-divider pt-4 mb-12">
              <Kicker>Leave a comment</Kicker>
              <div className="mt-3 flex flex-wrap gap-2">
                <select value={commentSection} onChange={(e) => setCommentSection(e.target.value)} className={`${inputCls} w-[150px]`}>
                  <option value="issues">Customer Issues</option>
                  <option value="operations">Operations</option>
                  <option value="growth">Growth</option>
                </select>
                <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Push back, ask, or note something…" className={`${inputCls} flex-1 min-w-[200px]`} />
                <button
                  className={btnSecondary}
                  disabled={!commentBody.trim() || pending}
                  onClick={() =>
                    start(async () => {
                      const r = await addReportComment(data.weekStart, commentSection, commentBody);
                      if (r?.error) setErr(r.error);
                      else {
                        setComments((c) => [...c, { id: `tmp-${Date.now()}`, week_start: data.weekStart, section: commentSection, author: data.userName, body: commentBody.trim(), created_at: new Date().toISOString(), resolved_at: null }]);
                        setCommentBody("");
                      }
                    })
                  }
                >
                  Comment
                </button>
              </div>
            </section>
          </div>

          {/* ── Right rail ── */}
          <div className="mb-12" id="items">
            <div className="mt-7 border-t-2 border-ops-text pt-4 flex items-baseline justify-between">
              <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">Action Items</h2>
              <span className="text-[13px] text-[rgba(26,26,26,.62)]">{items.filter((i) => !i.completed_week).length} open</span>
            </div>
            <p className="mt-2 text-[12.5px] text-[rgba(26,26,26,.62)]">
              Carried forward until closed. Owners are people, never &ldquo;management&rdquo;.
            </p>
            {items.map((a) => {
              const done = a.completed_week === data.weekStart;
              const carried = a.opened_week !== data.weekStart && !done;
              return (
                <div key={a.id} className="border-b border-ops-hairline py-3.5 flex items-start gap-3">
                  <button
                    aria-label={done ? "Reopen" : "Complete"}
                    onClick={() => {
                      setItems((cur) => cur.map((x) => (x.id === a.id ? { ...x, completed_week: done ? null : data.weekStart } : x)));
                      start(async () => { await setActionItemDone(a.id, data.weekStart, !done); });
                    }}
                    className={`mt-0.5 w-4 h-4 shrink-0 border ${done ? "bg-ops-accent border-ops-accent" : "border-ops-divider"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[15px] ${done ? "line-through text-[rgba(26,26,26,.5)]" : ""}`}>{a.action}</div>
                    <div className="text-[12.5px] mt-1 flex items-center gap-2">
                      <Tag tone="neutral">{a.owner}</Tag>
                      {done ? (
                        <span className="text-ops-accent">Completed — drops off next week</span>
                      ) : carried ? (
                        <span className="text-ops-danger">Overdue · carried since {new Date(a.opened_week + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      ) : (
                        <span className="text-[rgba(26,26,26,.62)]">This week</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setItems((cur) => cur.filter((x) => x.id !== a.id)); start(async () => { await removeActionItem(a.id); }); }} className="text-[rgba(26,26,26,.4)] hover:text-ops-danger shrink-0">✕</button>
                </div>
              );
            })}
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="Owner" className={`${inputCls} w-[90px]`} />
              <input value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Action" className={`${inputCls} flex-1 min-w-[140px]`} />
              <select value={newSection} onChange={(e) => setNewSection(e.target.value as "operations" | "growth")} className={`${inputCls} w-[92px]`}>
                <option value="operations">Ops</option>
                <option value="growth">Growth</option>
              </select>
              <button
                className={btnSecondary}
                disabled={!newOwner.trim() || !newAction.trim() || pending}
                onClick={() =>
                  start(async () => {
                    const r = await addActionItem({ owner: newOwner, action: newAction, section: newSection, openedWeek: data.weekStart });
                    if (r?.error) setErr(r.error);
                    else {
                      setItems((c) => [...c, { id: `tmp-${Date.now()}`, owner: newOwner.trim(), action: newAction.trim(), section: newSection, opened_week: data.weekStart, completed_week: null }]);
                      setNewOwner(""); setNewAction("");
                    }
                  })
                }
              >
                Add
              </button>
            </div>

            {/* Past updates */}
            <div className="mt-9 border-t border-ops-divider pt-3">
              <Kicker>Past updates</Kicker>
              {data.pastUpdates.length === 0 ? (
                <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">This is the first week in the app.</p>
              ) : (
                data.pastUpdates.map((u) => (
                  <div key={u.week_start} className="border-b border-ops-hairline py-2.5 flex items-center justify-between">
                    <Link href="/dispatch/weekly" className="text-[15px] text-ops-accent">
                      Week of {new Date(u.week_start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Link>
                    <span className="text-[12.5px] text-[rgba(26,26,26,.62)]">{u.submitted_at ? "Closed" : "Never submitted"}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
