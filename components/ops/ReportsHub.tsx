"use client";

// Reports — the weekly update is the front page; action items and past updates
// live beside it. The update follows the company's mandated format exactly
// (Sweetwaters_brain/wiki/operations.md): the revenue table carries four
// labelled values on every line, every time. That rule exists because an
// unlabelled single number once made a business running +15% read as flat.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Reg, Tag, btnPrimary, btnSecondary, inputCls, Kicker } from "@/components/ops/Bits";
import ActionItemsPanel, { type ActionItemTeamMember } from "@/components/ops/ActionItemsPanel";
import CustomerIssuesPanel from "@/components/ops/CustomerIssuesPanel";
import LineListField from "@/components/ops/LineListField";
import GrowthTouchpoints, { type WeekTouchpointRow } from "@/components/ops/GrowthTouchpoints";
import RetentionPanel, { type RetentionRow } from "@/components/ops/RetentionPanel";
import type { EntityComment } from "@/lib/actions/comments";
import {
  saveWeeklyUpdate,
  submitWeeklyUpdate,
  addReportComment,
  type ReportCommentRow,
  type CustomerIssueRow,
} from "@/lib/actions/weekly";
import type { OpenActionItem, WeeklyRow } from "@/lib/opsData";
import { renderWeeklyUpdate } from "@/lib/weeklyUpdate";
import ReportsNav from "@/components/ops/ReportsNav";

export interface ReportsData {
  weekStart: string;
  /** The real current week — differs from weekStart when viewing a past update. */
  currentWeekStart: string;
  userName: string;
  weekly: WeeklyRow | null;
  items: OpenActionItem[];
  team: ActionItemTeamMember[];
  issues: { open: number; newThisWeek: number; resolved: number };
  customerIssues: CustomerIssueRow[];
  issueComments: Record<string, EntityComment[]>;
  itemComments: Record<string, EntityComment[]>;
  activeOpportunities: number;
  touchpointsThisWeek: number;
  weekTouchpoints: WeekTouchpointRow[];
  retention: RetentionRow[];
  retentionComments: Record<string, EntityComment[]>;
  comments: ReportCommentRow[];
  pastUpdates: { week_start: string; submitted_at: string | null; written: boolean }[];
  role?: "admin" | "dispatcher";
  customers: { id: string; name: string }[];
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9.-]/g, "")));
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

  // Revenue is no longer edited here — the section is touchpoints now — but
  // the emailed copy still carries the figures, so read them straight off the
  // saved row.
  const swWeek = String(s?.sweetwater_revenue ?? "");
  const swYtd = String(s?.sweetwater_ytd ?? "");
  const swPrior = String(s?.sweetwater_ytd_prior ?? "");
  const jrsWeek = String(s?.jrs_revenue ?? "");
  const jrsYtd = String(s?.jrs_ytd ?? "");
  const jrsPrior = String(s?.jrs_ytd_prior ?? "");
  const delWeek = String(s?.delivery_revenue ?? "");
  const delYtd = String(s?.delivery_ytd ?? "");

  const [staffing, setStaffing] = useState(s?.staffing_status ?? "Green");
  const [staffingNote, setStaffingNote] = useState(s?.staffing_note ?? "");
  const [equipment, setEquipment] = useState(s?.equipment_status ?? "Green");
  const [equipmentNote, setEquipmentNote] = useState(s?.equipment_note ?? "");
  const [keyUpdates, setKeyUpdates] = useState(s?.key_updates ?? "");

  // Counts for the emailed copy come straight off the logged issues now —
  // there's nothing to type, so nothing to get out of step with the list.
  const issueOpen = data.customerIssues.filter((i) => !i.resolved_week).length;
  const issueNew = data.customerIssues.filter((i) => !i.resolved_week && i.opened_week === data.weekStart).length;
  const issueResolved = data.customerIssues.filter((i) => i.resolved_week === data.weekStart).length;

  const [items, setItems] = useState(data.items);

  const [commentBody, setCommentBody] = useState("");
  const [commentSection, setCommentSection] = useState("operations");
  const [comments, setComments] = useState(data.comments);


  function save(then?: () => void) {
    setErr("");
    start(async () => {
      // Revenue is owned by Reports -> Revenue; sending it from here would
      // let a stale tab overwrite figures entered after it loaded.
      const res = await saveWeeklyUpdate({
        week_start: data.weekStart,
        staffing_status: staffing, staffing_note: staffingNote,
        equipment_status: equipment, equipment_note: equipmentNote,
        key_updates: keyUpdates,
      });
      if (res?.error) setErr(res.error);
      else then?.();
    });
  }

  // Autosave — debounced, so a run of keystrokes doesn't fire a save each.
  // Skips the mount render (nothing changed yet, and everything here is
  // seeded straight from the saved row) via the `dirty` ref.
  const dirty = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (!dirty.current) { dirty.current = true; return; }
    setSaveState("saving");
    const t = setTimeout(() => {
      save(() => setSaveState("saved"));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffing, staffingNote, equipment, equipmentNote, keyUpdates]);

  const updateText = () =>
    renderWeeklyUpdate({
      date: new Date(),
      openIssues: issueOpen,
      newIssues: issueNew,
      resolvedIssues: issueResolved,
      staffingStatus: staffing, staffingNote,
      equipmentStatus: equipment, equipmentNote,
      keyUpdates,
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
      <ReportsNav active="Weekly update" role={data.role} />
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
        {data.weekStart !== data.currentWeekStart && (
          <p className="mt-3 text-[13.5px] bg-ops-gold-100 border border-ops-divider inline-block px-3 py-1.5">
            Viewing a past week.{" "}
            <Link href="/reports" className="text-ops-accent underline">Back to this week</Link>
          </p>
        )}

        <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-14 mt-2">
          {/* ── The update ── */}
          <div>
            {/* 1 · Customer Issues */}
            <section className="mt-7 border-t-2 border-ops-text pt-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold text-[24px] leading-none">
                  <span className="text-[rgba(26,26,26,.5)] mr-3">1</span>Customer Issues
                </h2>
                <Tag tone="neutral">filled in weekly · unresolved carries over</Tag>
              </div>
              <CustomerIssuesPanel issues={data.customerIssues} weekStart={data.weekStart} comments={data.issueComments} customers={data.customers} />
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
              {/* Genuinely lists, so edited as lists. A textarea labelled
                  "one per line" is a textarea asking the writer to remember a
                  convention, and it reliably got one long sentence instead. */}
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <LineListField
                  label="Staffing"
                  value={staffingNote ?? ""}
                  onChange={setStaffingNote}
                  placeholder={["Who's out / covering", "Open roles", "Anything to raise on the call"]}
                />
                <LineListField
                  label="Equipment"
                  value={equipmentNote ?? ""}
                  onChange={setEquipmentNote}
                  placeholder={["Anything down or limping", "Repairs booked", "Parts / service needed"]}
                />
              </div>
              <div className="mt-4">
                <LineListField
                  label="Key updates"
                  value={keyUpdates ?? ""}
                  onChange={setKeyUpdates}
                  placeholder={["What changed this week", "What you need a decision on", "Anything the owner should know before the call"]}
                />
              </div>
              <CommentCallout section="operations" />
            </section>

            {/* 3 · Growth — touchpoints. Revenue entry is deliberately not
                here for now; the figures still render on Reports → Revenue. */}
            <section className="mt-8 border-t-2 border-ops-text pt-4 mb-10">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold text-[24px] leading-none">
                  <span className="text-[rgba(26,26,26,.5)] mr-3">3</span>Growth
                </h2>
                <Tag tone="neutral">this week&apos;s outreach</Tag>
              </div>
              <GrowthTouchpoints
                touchpoints={data.weekTouchpoints}
                activeOpportunities={data.activeOpportunities}
              />
              <CommentCallout section="growth" />
              <p className="mt-5 text-[12.5px] text-[rgba(26,26,26,.45)]">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : " "}
              </p>
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
            <ActionItemsPanel items={items} team={data.team} weekStart={data.weekStart} comments={data.itemComments} onChange={setItems} />

            {/* Retention sits with the action items rather than in the numbered
                sections: it isn't something to write up, it's a list of calls
                to assign. */}
            <div className="mt-9 border-t-2 border-ops-text pt-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">Retention</h2>
                <Tag tone="neutral">from the SPOT export</Tag>
              </div>
              <RetentionPanel rows={data.retention} comments={data.retentionComments} />
            </div>

            {/* Past updates */}
            <div className="mt-9 border-t border-ops-divider pt-3">
              <Kicker>Past updates</Kicker>
              {data.pastUpdates.length === 0 ? (
                <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">This is the first week in the app.</p>
              ) : (
                data.pastUpdates.map((u) => (
                  <div key={u.week_start} className="border-b border-ops-hairline py-2.5 flex items-center justify-between">
                    <Link href={`/reports?week=${u.week_start}`} className="text-[15px] text-ops-accent">
                      Week of {new Date(u.week_start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Link>
                    <span className="text-[12.5px] text-[rgba(26,26,26,.62)]">
                      {u.submitted_at ? "Closed" : u.written ? "Draft, not sent" : "Revenue only"}
                    </span>
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
