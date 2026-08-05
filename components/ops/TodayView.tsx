"use client";

// Today — the Ops Hub home. Answers four questions before the owner does
// anything: is anything on fire, are we ahead or behind, what do I owe
// someone, is the weekly update in. Four bands: Delivery (full width),
// Messages + Reports side by side, Prospects as a single line.

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Band, Tag, OpenLink, btnPrimary, btnSecondary } from "@/components/ops/Bits";
import ActionItemsPanel, { type ActionItemTeamMember } from "@/components/ops/ActionItemsPanel";
import { resolveException, type ExceptionKind } from "@/lib/actions/exceptions";
import type { ActionItemRow } from "@/lib/actions/weekly";
import { GOAL_MULTIPLIER, DELIVERY_GOAL_PCT } from "@/lib/weeklyUpdate";
import type { EntityComment } from "@/lib/actions/comments";

export interface TodayData {
  userName: string;
  todayIso: string;
  route: {
    id: string;
    status: string;
    runLabel: string;
    stops: { id: string; order: number; status: string; name: string }[];
  } | null;
  exceptions: { stopId: string; kind: string; label: string; sentence: string }[];
  messages: {
    waitingCount: number;
    totalThreads: number;
    rows: { digits: string; name: string; excerpt: string; about: string; waitingSince: string | null; channels: string[] }[];
  };
  reports: {
    hasDraft: boolean;
    submitted: boolean;
    swYtd: number | null;
    swPrior: number | null;
    deliveryYtd: number | null;
    openItemCount: number;
  };
  actionItems: ActionItemRow[];
  itemComments: Record<string, EntityComment[]>;
  team: ActionItemTeamMember[];
  prospects: { overdue: number; line: string };
  weekStart: string;
}

const ageLabel = (iso: string | null) => {
  if (!iso) return "";
  const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

export default function TodayView({ data }: { data: TodayData }) {
  const [, start] = useTransition();
  const [stops, setStops] = useState(data.route?.stops ?? []);
  const [exceptions, setExceptions] = useState(data.exceptions);

  // Live edge: poll /api/live every 30s while a route is out.
  useEffect(() => {
    if (!data.route || data.route.status === "completed") return;
    let live = true;
    const poll = () =>
      fetch("/api/live", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!live || !d?.route?.route_stops) return;
          const byId = new Map(
            (d.route.route_stops as { id: string; status: string }[]).map((s) => [s.id, s.status])
          );
          setStops((cur) => cur.map((s) => ({ ...s, status: byId.get(s.id) ?? s.status })));
        })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 30_000);
    return () => { live = false; clearInterval(t); };
  }, [data.route]);

  const done = stops.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const current = stops.find((s) => s.status === "arrived") ?? stops.find((s) => s.status === "pending");
  const remaining = stops.length - done;

  // Honest estimate: ~9 minutes per remaining stop including the drive. Marked
  // "est." because it is one.
  const estFinish = useMemo(() => {
    if (!data.route || remaining === 0) return null;
    return new Date(Date.now() + remaining * 9 * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }, [data.route, remaining]);

  // The day in plain words, generated from state.
  const sentence = useMemo(() => {
    const parts: string[] = [];
    if (!data.route) parts.push("No route is out today.");
    else if (data.route.status === "completed" || remaining === 0) parts.push("The run is done.");
    else if (data.route.status === "dispatched" || data.route.status === "in_progress")
      parts.push(`Van is out — ${done} of ${stops.length} stops done.`);
    else parts.push("Today's route is still a draft.");
    if (data.messages.waitingCount > 0)
      parts.push(`${data.messages.waitingCount} message${data.messages.waitingCount === 1 ? "" : "s"} need${data.messages.waitingCount === 1 ? "s" : ""} a reply.`);
    if (!data.reports.submitted)
      parts.push(data.reports.hasDraft ? "The weekly update is drafted but not submitted." : "The weekly update hasn't been started.");
    if (data.prospects.overdue > 0) parts.push(`${data.prospects.overdue} prospect check-in${data.prospects.overdue === 1 ? " is" : "s are"} overdue.`);
    return parts.join(" ");
  }, [data, done, remaining, stops.length]);

  // Reports metrics (same math as the weekly update format).
  const metrics = useMemo(() => {
    const { swYtd, swPrior, deliveryYtd } = data.reports;
    if (swYtd == null || swPrior == null || swPrior === 0) return null;
    const goal = swPrior * GOAL_MULTIPLIER.sweetwater;
    const vsGoal = ((swYtd - goal) / goal) * 100;
    const vsPrior = ((swYtd - swPrior) / swPrior) * 100;
    const share = deliveryYtd != null && swYtd > 0 ? (deliveryYtd / swYtd) * 100 : null;
    return { vsGoal, vsPrior, share, goalGap: swYtd - goal };
  }, [data.reports]);

  const fmtPct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2)}%`;

  return (
    <div className="mx-auto max-w-[1440px] px-5 md:px-12">
      {/* ── Title block ── */}
      <div className="pt-8 md:pt-10">
        <h1 className="font-barlowc font-semibold text-[30px] md:text-[46px] leading-none">Today</h1>
        <p className="mt-3 max-w-[620px] text-[15px] md:text-[17px] text-[rgba(26,26,26,.78)]">{sentence}</p>
      </div>

      {/* ── Delivery band ── */}
      <Band title="Delivery" right={<OpenLink href="/delivery">Open Delivery</OpenLink>}>
        {data.route && stops.length > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="font-barlowc font-semibold text-[48px] md:text-[64px] leading-[0.9] tracking-[-0.01em]">{done}</span>
                <span className="font-barlowc font-semibold text-[22px] md:text-[26px] text-[rgba(26,26,26,.5)]">of {stops.length}</span>
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="text-[14px] md:text-[15px] text-[rgba(26,26,26,.78)] mb-2">
                  {current ? `${current.status === "arrived" ? "At" : "Heading to"} ${current.name} · ${data.route.runLabel}` : `All stops done · ${data.route.runLabel}`}
                </div>
                {/* Stop tape */}
                <div className="flex gap-[3px] md:gap-1 h-[14px] md:h-5">
                  {stops.map((s) => (
                    <div
                      key={s.id}
                      title={`${s.order}. ${s.name}`}
                      className="flex-1"
                      style={{
                        background:
                          s.status === "completed" || s.status === "skipped"
                            ? "#02733e"
                            : s.id === current?.id
                            ? "#d59a29"
                            : "rgba(26,26,26,.13)",
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0 ml-auto">
                {estFinish && <span className="text-[13px] text-[rgba(26,26,26,.68)]">est. finish {estFinish} · {remaining} left</span>}
                <Link href="/delivery" className={btnSecondary}>Track the run</Link>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-4 py-2">
            <p className="text-[15px] text-[rgba(26,26,26,.68)]">No route out today.</p>
            <Link href="/delivery" className={btnSecondary}>Open Delivery</Link>
          </div>
        )}

        {/* Exceptions */}
        {exceptions.map((e) => (
          <div key={e.stopId + e.kind} className="mt-4 border-t border-ops-hairline pt-3 flex flex-wrap items-center gap-3">
            <Tag tone="danger">{e.label}</Tag>
            <span className="flex-1 min-w-[200px] text-[15px]">{e.sentence}</span>
            <div className="flex gap-2 shrink-0">
              <Link href="/delivery" className={btnSecondary}>Add to today</Link>
              <button
                className={btnSecondary}
                onClick={() => {
                  setExceptions((cur) => cur.filter((x) => !(x.stopId === e.stopId && x.kind === e.kind)));
                  start(async () => { await resolveException(e.stopId, e.kind as ExceptionKind); });
                }}
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
      </Band>

      {/* ── Messages + Reports ── */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-14">
        <Band title="Messages" right={<OpenLink href="/messages">Open Messages</OpenLink>}>
          <p className="mt-1 text-[13px] text-[rgba(26,26,26,.62)]">
            {data.messages.waitingCount} need a reply · {data.messages.totalThreads} threads · texts on the office line
          </p>
          {data.messages.rows.length === 0 ? (
            <p className="mt-4 text-[15px] text-[rgba(26,26,26,.68)]">Nothing waiting on you.</p>
          ) : (
            data.messages.rows.map((m, i) => (
              <div key={m.digits} className="mt-3 border-t border-ops-hairline pt-3 flex items-start gap-3">
                <div className="flex flex-col gap-1 shrink-0">
                  {m.channels.map((c) => (
                    <Tag key={c} tone="neutral">{c === "text" ? "Text" : "Email"}</Tag>
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-barlow font-medium text-[15px]">{m.name}</span>
                    {m.waitingSince && <span className="text-[13px] text-ops-danger">· {ageLabel(m.waitingSince)}</span>}
                  </div>
                  <div className="text-[14px] text-[rgba(26,26,26,.78)] truncate">&ldquo;{m.excerpt}&rdquo;</div>
                  <div className="text-[12.5px] text-[rgba(26,26,26,.62)] mt-0.5">{m.about}</div>
                </div>
                <Link href={`/messages?open=${m.digits}`} className={i === 0 ? btnPrimary : btnSecondary}>
                  {i === 0 ? "Reply" : "Open"}
                </Link>
              </div>
            ))
          )}
        </Band>

        <Band title="Reports" right={<OpenLink href="/reports">Open Reports</OpenLink>}>
          <p className="mt-1 text-[13px] text-[rgba(26,26,26,.62)]">
            Weekly update {data.reports.submitted ? "submitted" : "due Friday 8:00"} · {data.reports.openItemCount} action item{data.reports.openItemCount === 1 ? "" : "s"} open
          </p>
          <div className="mt-3 border-t border-ops-hairline pt-3 flex flex-wrap items-center gap-3">
            <Tag tone={data.reports.submitted ? "accent" : "gold"}>
              {data.reports.submitted ? "Submitted" : data.reports.hasDraft ? "In draft" : "Not started"}
            </Tag>
            <span className="flex-1 min-w-[160px] text-[15px]">
              {data.reports.submitted ? "This week's update is in." : data.reports.hasDraft ? "Draft in progress" : "Nothing written yet"}
            </span>
            <Link href="/reports" className={btnPrimary}>{data.reports.hasDraft ? "Continue draft" : "Start the draft"}</Link>
          </div>
          {metrics ? (
            <div className="mt-4 border-t border-ops-hairline pt-4 grid grid-cols-3 gap-4">
              <div>
                <div className={`font-barlowc font-semibold text-[26px] md:text-[34px] leading-none ${metrics.vsGoal >= 0 ? "text-ops-accent" : "text-ops-danger"}`}>{fmtPct(metrics.vsGoal)}</div>
                <div className="text-[12.5px] text-[rgba(26,26,26,.62)] mt-1">vs goal · ${Math.abs(Math.round(metrics.goalGap)).toLocaleString()} {metrics.goalGap >= 0 ? "ahead" : "behind"}</div>
              </div>
              <div>
                <div className="font-barlowc font-semibold text-[26px] md:text-[34px] leading-none">{fmtPct(metrics.vsPrior)}</div>
                <div className="text-[12.5px] text-[rgba(26,26,26,.62)] mt-1">vs prior year</div>
              </div>
              <div>
                <div className="font-barlowc font-semibold text-[26px] md:text-[34px] leading-none text-ops-gold-deep">{metrics.share != null ? `${metrics.share.toFixed(1)}%` : "—"}</div>
                <div className="text-[12.5px] text-[rgba(26,26,26,.62)] mt-1">delivery · goal {DELIVERY_GOAL_PCT}%</div>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t border-ops-hairline pt-3 text-[13px] text-[rgba(26,26,26,.62)]">
              Revenue figures appear here once this week&apos;s numbers are entered in Reports.
            </p>
          )}
        </Band>
      </div>

      {/* ── Action Items band ── */}
      <Band title="Action Items" right={<OpenLink href="/reports#items">Open Reports</OpenLink>}>
        <ActionItemsPanel items={data.actionItems} team={data.team} weekStart={data.weekStart} comments={data.itemComments} />
      </Band>

      {/* ── Prospects band ── */}
      <Band title="Prospects" right={<OpenLink href="/prospects">Open Prospects</OpenLink>} className="mb-6">
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-2 shrink-0">
            <span className={`font-barlowc font-semibold text-[34px] leading-none ${data.prospects.overdue > 0 ? "text-ops-danger" : "text-ops-accent"}`}>
              {data.prospects.overdue}
            </span>
            <span className="text-[13px] text-[rgba(26,26,26,.62)]">check-ins overdue</span>
          </div>
          <span className="flex-1 min-w-[220px] text-[15px] text-[rgba(26,26,26,.78)]">
            {data.prospects.line || (data.prospects.overdue === 0 ? "Every prospect has been touched inside its window." : "")}
          </span>
          <Link href="/prospects" className={btnSecondary}>Review check-ins</Link>
        </div>
      </Band>
    </div>
  );
}
