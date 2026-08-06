import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Band, Tag } from "@/components/ops/Bits";
import ReportsNav from "@/components/ops/ReportsNav";
import ProspectStatCards from "@/components/ops/ProspectStatCards";
import { needsAttention, daysOverdue } from "@/lib/prospectVisit";
import type { Prospect } from "@/lib/types";
import { touchpointWeek } from "@/lib/date";

export const dynamic = "force-dynamic";

interface TpRow {
  type: string;
  created_by: string | null;
  created_at: string;
  prospects: { id: string; name: string } | null;
}

// Outreach that counts toward the engagement clock. A note is someone writing
// something down, not reaching the prospect, so it's excluded here the same
// way it is everywhere else.
const OUTREACH = ["visit", "call", "delivery", "email", "text"];
const TYPE_LABEL: Record<string, string> = {
  visit: "Visits",
  call: "Calls",
  delivery: "Deliveries",
  email: "Emails",
  text: "Texts",
};

const DAY = 86_400_000;

/** Prospect reporting: what outreach actually happened, what's slipping, and
 *  which accounts are getting the attention. */
export default async function ReportsProspectsPage() {
  const supabase = createAdminClient();

  let touches: TpRow[] = [];
  try {
    const { data } = await supabase
      .from("prospect_touchpoints")
      .select("type, created_by, created_at, prospects(id, name)")
      .gte("created_at", new Date(Date.now() - 90 * DAY).toISOString())
      .order("created_at", { ascending: false });
    touches = ((data ?? []) as unknown as TpRow[]).filter((t) => OUTREACH.includes(t.type));
  } catch { /* table absent — page renders empty rather than erroring */ }

  let prospects: (Prospect & { name: string; town: string | null })[] = [];
  try {
    const { data } = await supabase
      .from("prospects")
      .select("id, name, town, status, priority, created_at, manual_request_at, touchpoints:prospect_touchpoints(type, created_at)")
      .is("deleted_at", null)
      .in("status", ["new", "working", "active"]);
    prospects = (data ?? []) as unknown as (Prospect & { name: string; town: string | null })[];
  } catch { /* same */ }

  // The reporting week runs Friday–Thursday, matching the weekly update.
  const thisWeek = touchpointWeek();
  const lastWeek = {
    from: new Date(thisWeek.from.getTime() - 7 * DAY),
    to: thisWeek.from,
  };
  const at = (t: TpRow) => new Date(t.created_at).getTime();
  const between = (t: TpRow, w: { from: Date; to: Date }) =>
    at(t) >= w.from.getTime() && at(t) < w.to.getTime();
  const inWindow = (t: TpRow, days: number) => at(t) >= Date.now() - days * DAY;

  const week = touches.filter((t) => between(t, thisWeek));
  const prior = touches.filter((t) => between(t, lastWeek));
  const month = touches.filter((t) => inWindow(t, 30));

  // By type, this week.
  const byType = OUTREACH.map((type) => ({
    type,
    label: TYPE_LABEL[type],
    week: week.filter((t) => t.type === type).length,
    month: month.filter((t) => t.type === type).length,
  })).filter((r) => r.month > 0);

  // Who's doing the outreach. created_by is a display name.
  const byPerson = Object.entries(
    month.reduce<Record<string, { week: number; month: number }>>((acc, t) => {
      const who = (t.created_by || "").trim() || "Unattributed";
      acc[who] ??= { week: 0, month: 0 };
      acc[who].month += 1;
      if (between(t, thisWeek)) acc[who].week += 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1].month - a[1].month);

  // Most-worked accounts (touch volume), and what's gone quiet.
  const byProspect = Object.entries(
    month.reduce<Record<string, { id: string; name: string; n: number }>>((acc, t) => {
      if (!t.prospects) return acc;
      acc[t.prospects.id] ??= { id: t.prospects.id, name: t.prospects.name, n: 0 };
      acc[t.prospects.id].n += 1;
      return acc;
    }, {})
  )
    .map(([, v]) => v)
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const due = prospects
    .filter(needsAttention)
    .sort((a, b) => daysOverdue(b) - daysOverdue(a));

  const delta = week.length - prior.length;

  return (
    <>
      <ReportsNav active="Prospects" />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-6 space-y-6">
        <div>
          <h1 className="font-barlowc text-[26px] font-semibold uppercase tracking-[0.04em]">Prospects</h1>
          <p className="font-barlow text-[14px] text-[rgba(26,26,26,.6)] mt-0.5">
            Outreach that reached someone — notes excluded, same as the check-in
            clock. The week runs Friday to Thursday, matching the weekly update.
          </p>
        </div>

        {/* Headline counts — each opens the rows behind it */}
        <ProspectStatCards
          cards={[
            { label: "This week", value: week.length, sub: prior.length > 0 || week.length > 0 ? `${delta >= 0 ? "+" : ""}${delta} vs last week` : "no activity yet" },
            { label: "Last 30 days", value: month.length, sub: `${byPerson.length} ${byPerson.length === 1 ? "person" : "people"}` },
            { label: "Check-ins due", value: due.length, sub: due.length ? `worst ${daysOverdue(due[0])}d past due` : "all current" },
            { label: "Active prospects", value: prospects.length, sub: "new, working, active" },
          ]}
          weekTouches={week.map((t) => ({
            type: t.type, createdBy: t.created_by, createdAt: t.created_at,
            prospectId: t.prospects?.id ?? null, prospectName: t.prospects?.name ?? "Unknown",
          }))}
          monthTouches={month.map((t) => ({
            type: t.type, createdBy: t.created_by, createdAt: t.created_at,
            prospectId: t.prospects?.id ?? null, prospectName: t.prospects?.name ?? "Unknown",
          }))}
          due={due.map((p) => ({
            id: p.id, name: p.name, town: p.town,
            label: daysOverdue(p) > 0 ? `${daysOverdue(p)}d past due` : "Requested",
          }))}
          active={prospects.map((p) => ({ id: p.id, name: p.name, town: p.town, status: p.status }))}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Band title="How we reached them">
            {byType.length === 0 ? (
              <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)]">No outreach logged in the last 30 days.</p>
            ) : (
              <table className="w-full font-barlow text-[14px]">
                <thead>
                  <tr className="text-[rgba(26,26,26,.5)] text-[12px] uppercase tracking-[0.06em]">
                    <th className="text-left font-normal pb-2">Type</th>
                    <th className="text-right font-normal pb-2">This week</th>
                    <th className="text-right font-normal pb-2">30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((r) => (
                    <tr key={r.type} className="border-t border-ops-divider">
                      <td className="py-2">{r.label}</td>
                      <td className="py-2 text-right tabular-nums">{r.week}</td>
                      <td className="py-2 text-right tabular-nums text-[rgba(26,26,26,.6)]">{r.month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Band>

          <Band title="Who's doing the outreach">
            {byPerson.length === 0 ? (
              <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)]">Nothing logged in the last 30 days.</p>
            ) : (
              <table className="w-full font-barlow text-[14px]">
                <thead>
                  <tr className="text-[rgba(26,26,26,.5)] text-[12px] uppercase tracking-[0.06em]">
                    <th className="text-left font-normal pb-2">Person</th>
                    <th className="text-right font-normal pb-2">This week</th>
                    <th className="text-right font-normal pb-2">30 days</th>
                  </tr>
                </thead>
                <tbody>
                  {byPerson.map(([who, v]) => (
                    <tr key={who} className="border-t border-ops-divider">
                      <td className="py-2">{who}</td>
                      <td className="py-2 text-right tabular-nums">{v.week}</td>
                      <td className="py-2 text-right tabular-nums text-[rgba(26,26,26,.6)]">{v.month}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Band>

          <Band title="Most-worked accounts" right={<Link href="/prospects/touchpoints" className="font-barlowc text-[12px] uppercase tracking-[0.08em] text-ops-accent">Full log</Link>}>
            {byProspect.length === 0 ? (
              <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)]">No touchpoints in the last 30 days.</p>
            ) : (
              <div className="divide-y divide-ops-divider">
                {byProspect.map((p) => (
                  <Link key={p.id} href={`/prospects/list?id=${p.id}`} className="flex items-center gap-3 py-2.5 hover:bg-[rgba(26,26,26,.03)]">
                    <span className="font-barlow text-[14px] flex-1 min-w-0 truncate">{p.name}</span>
                    <span className="font-barlowc text-[13px] tabular-nums text-[rgba(26,26,26,.6)]">
                      {p.n} {p.n === 1 ? "touch" : "touches"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Band>

          <Band title="Check-ins due" right={<Link href="/prospects/checkins" className="font-barlowc text-[12px] uppercase tracking-[0.08em] text-ops-accent">Open</Link>}>
            {due.length === 0 ? (
              <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)]">Everyone&apos;s current — nothing overdue.</p>
            ) : (
              <div className="divide-y divide-ops-divider">
                {due.slice(0, 8).map((p) => (
                  <Link key={p.id} href={`/prospects/list?id=${p.id}`} className="flex items-center gap-3 py-2.5 hover:bg-[rgba(26,26,26,.03)]">
                    <span className="font-barlow text-[14px] flex-1 min-w-0 truncate">{p.name}</span>
                    {p.town && <span className="font-barlow text-[12.5px] text-[rgba(26,26,26,.45)]">{p.town}</span>}
                    <Tag tone={daysOverdue(p) >= 30 ? "danger" : "gold"}>
                      {daysOverdue(p) > 0 ? `${daysOverdue(p)}d past due` : "Requested"}
                    </Tag>
                  </Link>
                ))}
              </div>
            )}
          </Band>
        </div>
      </div>
    </>
  );
}
