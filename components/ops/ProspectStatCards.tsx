"use client";

// The four headline numbers on Reports → Prospects, each clickable into a
// popup with the rows behind it — so "This week: 4" doesn't require
// cross-referencing the tables below to know which 4.
import { useState } from "react";
import Link from "next/link";
import { Kicker } from "@/components/ops/Bits";

export interface TouchRow {
  type: string;
  createdBy: string | null;
  createdAt: string;
  prospectId: string | null;
  prospectName: string;
}
export interface DueRow {
  id: string;
  name: string;
  town: string | null;
  label: string;
}
export interface ActiveRow {
  id: string;
  name: string;
  town: string | null;
  status: string;
}

interface CardDef {
  label: string;
  value: number;
  sub: string;
}

const TYPE_LABEL: Record<string, string> = {
  visit: "Visit", call: "Call", delivery: "Delivery", email: "Email", text: "Text",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProspectStatCards({
  cards,
  weekTouches,
  monthTouches,
  due,
  active,
  prospectHrefBase = "/prospects/list?id=",
  touchpointsHref = "/prospects/touchpoints",
}: {
  cards: CardDef[];
  weekTouches: TouchRow[];
  monthTouches: TouchRow[];
  due: DueRow[];
  active: ActiveRow[];
  /** Owner (ops shell) and manager (dispatch shell) have different prospect
   *  routes — default is the ops-shell path. A plain string prefix (id gets
   *  appended), not a function: this is a Client Component, and a function
   *  passed down from the Server Component that renders it can't cross that
   *  boundary — it throws ("Server Components render" error) at request time,
   *  not at build time, which is how this shipped broken. */
  prospectHrefBase?: string;
  touchpointsHref?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const prospectHref = (id: string) => `${prospectHrefBase}${id}`;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setOpen(i)}
            className="border border-ops-divider p-4 text-left hover:bg-[rgba(26,26,26,.025)] transition-colors"
          >
            <Kicker>{s.label}</Kicker>
            <div className="font-barlowc text-[32px] font-semibold leading-none mt-1.5">{s.value}</div>
            <div className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-1">{s.sub}</div>
          </button>
        ))}
      </div>

      {open !== null && (
        <div className="fixed inset-0 z-50 bg-[rgba(11,11,12,.5)] flex items-end md:items-center justify-center" onClick={() => setOpen(null)}>
          <div
            className="bg-ops-bg w-full md:max-w-lg md:rounded-sm rounded-t-sm max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-ops-divider flex items-center justify-between shrink-0">
              <h3 className="font-barlowc text-[18px] font-semibold uppercase tracking-[0.04em]">{cards[open].label}</h3>
              <button onClick={() => setOpen(null)} className="text-[rgba(26,26,26,.4)] text-xl leading-none px-1" aria-label="Close">✕</button>
            </div>
            <div className="overflow-y-auto">
              {open === 0 && <TouchList rows={weekTouches} empty="No outreach logged this week." prospectHref={prospectHref} touchpointsHref={touchpointsHref} />}
              {open === 1 && <TouchList rows={monthTouches} empty="No outreach logged in the last 30 days." prospectHref={prospectHref} touchpointsHref={touchpointsHref} />}
              {open === 2 && (
                due.length === 0 ? (
                  <p className="p-6 text-center text-[14px] text-[rgba(26,26,26,.5)] font-barlow">Everyone&apos;s current — nothing overdue.</p>
                ) : (
                  <div className="divide-y divide-ops-divider">
                    {due.map((p) => (
                      <Link key={p.id} href={prospectHref(p.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(26,26,26,.03)]">
                        <span className="font-barlow text-[14px] flex-1 min-w-0 truncate">{p.name}</span>
                        {p.town && <span className="font-barlow text-[12.5px] text-[rgba(26,26,26,.45)]">{p.town}</span>}
                        <span className="font-barlowc text-[12px] uppercase tracking-wide px-2 py-0.5 bg-[rgba(184,130,31,.15)] text-[#b8821f]">{p.label}</span>
                      </Link>
                    ))}
                  </div>
                )
              )}
              {open === 3 && (
                active.length === 0 ? (
                  <p className="p-6 text-center text-[14px] text-[rgba(26,26,26,.5)] font-barlow">No active prospects.</p>
                ) : (
                  <div className="divide-y divide-ops-divider">
                    {active.map((p) => (
                      <Link key={p.id} href={prospectHref(p.id)} className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(26,26,26,.03)]">
                        <span className="font-barlow text-[14px] flex-1 min-w-0 truncate">{p.name}</span>
                        {p.town && <span className="font-barlow text-[12.5px] text-[rgba(26,26,26,.45)]">{p.town}</span>}
                        <span className="font-barlowc text-[11px] uppercase tracking-wide px-2 py-0.5 bg-[rgba(26,26,26,.06)] text-[rgba(26,26,26,.6)]">{p.status}</span>
                      </Link>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TouchList({
  rows, empty, prospectHref, touchpointsHref,
}: { rows: TouchRow[]; empty: string; prospectHref: (id: string) => string; touchpointsHref: string }) {
  if (rows.length === 0) return <p className="p-6 text-center text-[14px] text-[rgba(26,26,26,.5)] font-barlow">{empty}</p>;
  return (
    <div className="divide-y divide-ops-divider">
      {rows.map((t, i) => (
        <Link
          key={i}
          href={t.prospectId ? prospectHref(t.prospectId) : touchpointsHref}
          className="flex items-center gap-3 px-5 py-3 hover:bg-[rgba(26,26,26,.03)]"
        >
          <span className="font-barlow text-[14px] flex-1 min-w-0 truncate">{t.prospectName}</span>
          <span className="font-barlowc text-[11px] uppercase tracking-wide px-2 py-0.5 bg-[rgba(26,26,26,.06)] text-[rgba(26,26,26,.6)] shrink-0">
            {TYPE_LABEL[t.type] ?? t.type}
          </span>
          <span className="font-barlow text-[12.5px] text-[rgba(26,26,26,.45)] shrink-0">{fmtDate(t.createdAt)}{t.createdBy ? ` · ${t.createdBy}` : ""}</span>
        </Link>
      ))}
    </div>
  );
}
