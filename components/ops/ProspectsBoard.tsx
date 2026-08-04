"use client";

// Prospects — the existing B2B CRM restyled as a blueprint board. Scope is
// unchanged: same segments, services, statuses and overdue windows as
// ProspectDirectory / lib/prospectVisit.ts. Cards are separated by hairlines
// within a column, not boxed; clicking one opens the full record.

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SubNav, SegLinks, Tag, Kicker, btnSecondary } from "@/components/ops/Bits";
import { addProspectVisit } from "@/lib/actions/prospectVisits";

export interface BoardCard {
  id: string;
  name: string;
  status: string;
  segment: string;
  town: string | null;
  priority: string;
  services: string[];
  overdueDays: number | null;
  neverTouched: boolean;
  lastLine: string;
  onHoldReason: string | null;
  onTodaysRun: "added" | "near" | null;
  nearStop: { stop: number; miles: number } | null;
  callOnly: boolean;
}

export interface BoardData {
  cards: BoardCard[];
  seg: string;
  tpCounts: { visit: number; call: number; email: number; text: number };
  routeId: string | null;
  runLabel: string;
  nearby: BoardCard[];
}

const SEG_LABEL: Record<string, string> = {
  prop_manager: "Property Manager",
  hotel: "Hotel / Resort",
  club: "Golf / Yacht Club",
  restaurant: "Restaurant",
  retail: "Retail",
  other: "Other",
};
const SERVICE_LABEL: Record<string, string> = {
  employees: "Employees",
  linen: "Linen",
  referral: "Customer referral",
};
const COLUMNS = [
  { id: "new", label: "New" },
  { id: "working", label: "Working" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
];

function Card({ c }: { c: BoardCard }) {
  return (
    <Link
      href={`/prospects/list?id=${c.id}`}
      className={`block border-b border-ops-hairline py-3.5 hover:bg-[rgba(26,26,26,.035)] ${c.status === "on_hold" ? "opacity-[.72]" : ""}`}
    >
      <div className="font-barlow font-medium text-[15.5px] leading-tight">{c.name}</div>
      <div className="text-[13px] text-[rgba(26,26,26,.68)] mt-1">
        {SEG_LABEL[c.segment] ?? c.segment}
        {c.town ? ` · ${c.town}` : ""}
        {c.priority !== "medium" ? ` · ${c.priority}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.overdueDays != null && <Tag tone="danger">{c.overdueDays > 0 ? `${c.overdueDays}d overdue` : "Due now"}</Tag>}
        {c.status === "active" && c.services.map((s) => <Tag key={s} tone="accent">{SERVICE_LABEL[s] ?? s}</Tag>)}
        {c.onTodaysRun && <Tag tone="gold">{c.onTodaysRun === "added" ? "On today's run" : `Near stop ${c.nearStop?.stop}`}</Tag>}
        {c.callOnly && <Tag tone="neutral">Call only</Tag>}
        {c.neverTouched && c.status === "new" && <Tag tone="neutral">No touch yet</Tag>}
      </div>
      <div className="text-[13px] text-[rgba(26,26,26,.62)] mt-2">
        {c.status === "on_hold" && c.onHoldReason ? c.onHoldReason.slice(0, 60) : c.lastLine}
      </div>
    </Link>
  );
}

export default function ProspectsBoard({ data }: { data: BoardData }) {
  const [, start] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (data.seg === "all" ? data.cards : data.cards.filter((c) => c.segment === data.seg)),
    [data]
  );
  const overdueCount = data.cards.filter((c) => c.overdueDays != null).length;
  const activeOpps = data.cards.filter((c) => c.status === "working" || c.status === "active").length;
  const tpTotal = Object.values(data.tpCounts).reduce((a, b) => a + b, 0);

  return (
    <>
      <SubNav
        items={[
          { label: "Pipeline", href: "/prospects", active: true },
          { label: "List", href: "/prospects/list" },
          { label: "Check-ins due", href: "/prospects/checkins", count: overdueCount },
          { label: "Touchpoints", href: "/prospects/touchpoints" },
        ]}
        action={<Link href="/prospects/list" className={btnSecondary}>Add prospect</Link>}
      />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12">
        <div className="pt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Commercial pipeline</h1>
            <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
              {activeOpps} active opportunities · {tpTotal} touchpoints this week · {overdueCount} check-ins overdue
            </p>
          </div>
          <div className="overflow-x-auto ops-subnav max-w-full">
            <SegLinks
              options={[
                { label: "All segments", href: "/prospects", selected: data.seg === "all" },
                { label: "Property Manager", href: "/prospects?seg=prop_manager", selected: data.seg === "prop_manager" },
                { label: "Hotel", href: "/prospects?seg=hotel", selected: data.seg === "hotel" },
                { label: "Club", href: "/prospects?seg=club", selected: data.seg === "club" },
                { label: "Restaurant", href: "/prospects?seg=restaurant", selected: data.seg === "restaurant" },
              ]}
            />
          </div>
        </div>

        {/* Board */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-10">
          {COLUMNS.map((col) => {
            const cards = filtered
              .filter((c) => c.status === col.id)
              .sort((a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1));
            return (
              <div key={col.id}>
                <div className="border-t border-ops-text pt-2.5 flex items-baseline justify-between">
                  <Kicker>{col.label}</Kicker>
                  <span className="font-barlowc font-semibold text-[15px] text-[rgba(26,26,26,.62)]">{cards.length}</span>
                </div>
                {cards.length === 0 ? (
                  <p className="py-4 text-[13px] text-[rgba(26,26,26,.5)]">None</p>
                ) : (
                  cards.map((c) => <Card key={c.id} c={c} />)
                )}
              </div>
            );
          })}
        </div>

        {/* Summaries */}
        <div className="mt-12 mb-8 md:grid md:grid-cols-2 md:gap-14">
          <div className="border-t border-ops-divider pt-3">
            <Kicker>Touchpoints this week · {tpTotal}</Kicker>
            <div className="mt-2 flex gap-8 text-[15px]">
              <span>Visits <b>{data.tpCounts.visit}</b></span>
              <span>Calls <b>{data.tpCounts.call}</b></span>
              <span>Emails <b>{data.tpCounts.email}</b></span>
              <span>Texts <b>{data.tpCounts.text}</b></span>
            </div>
            <p className="mt-2 text-[12.5px] text-[rgba(26,26,26,.62)]">
              Text touchpoints log themselves from Messages — email joins when the shared mailbox is connected.
            </p>
          </div>
          <div className="border-t border-ops-divider pt-3 mt-6 md:mt-0">
            <Kicker>Nearby today · {data.runLabel}</Kicker>
            {data.nearby.length === 0 ? (
              <p className="mt-2 text-[15px] text-[rgba(26,26,26,.68)]">
                {data.routeId ? "No open prospects sit near today's stops." : "No route out today."}
              </p>
            ) : (
              data.nearby.map((c) => {
                const isAdded = c.onTodaysRun === "added" || added.has(c.id);
                return (
                  <div key={c.id} className="border-b border-ops-hairline py-2.5 flex items-center justify-between gap-3">
                    <span className="text-[15px]">
                      {c.name} · {c.nearStop!.miles.toFixed(1)} mi from stop {c.nearStop!.stop}
                    </span>
                    {isAdded ? (
                      <Tag tone="accent">Added</Tag>
                    ) : (
                      <button
                        className={btnSecondary}
                        onClick={() => {
                          if (!data.routeId) return;
                          setAdded((cur) => new Set(cur).add(c.id));
                          start(async () => { await addProspectVisit(data.routeId!, c.id); });
                        }}
                      >
                        Add visit
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
