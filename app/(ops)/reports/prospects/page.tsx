import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Band, Kicker, Tag } from "@/components/ops/Bits";
import ReportsNav from "@/components/ops/ReportsNav";
import { needsAttention, daysSinceVisit } from "@/lib/prospectVisit";
import type { Prospect } from "@/lib/types";

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

  const since = (days: number) => Date.now() - days * DAY;
  const inWindow = (t: TpRow, days: number) => new Date(t.created_at).getTime() >= since(days);

  const week = touches.filter((t) => inWindow(t, 7));
  const prior = touches.filter((t) => !inWindow(t, 7) && inWindow(t, 14));
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
      if (inWindow(t, 7)) acc[who].week += 1;
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
    .sort((a, b) => daysSinceVisit(b) - daysSinceVisit(a));

  const delta = week.length - prior.length;

  return (
    <>
      <ReportsNav active="Prospects" />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-6 space-y-6">
        <div>
          <h1 className="font-barlowc text-[26px] font-semibold uppercase tracking-[0.04em]">Prospects</h1>
          <p className="font-barlow text-[14px] text-[rgba(26,26,26,.6)] mt-0.5">
            Outreach that reached someone — notes excluded, same as the check-in clock.
          </p>
        </div>

        {/* Headline counts */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "This week", value: week.length, sub: prior.length > 0 || week.length > 0 ? `${delta >= 0 ? "+" : ""}${delta} vs last week` : "no activity yet" },
            { label: "Last 30 days", value: month.length, sub: `${byPerson.length} ${byPerson.length === 1 ? "person" : "people"}` },
            { label: "Check-ins due", value: due.length, sub: due.length ? `worst ${daysSinceVisit(due[0])}d` : "all current" },
            { label: "Active prospects", value: prospects.length, sub: "new, working, active" },
          ].map((s) => (
            <div key={s.label} className="border border-ops-divider p-4">
              <Kicker>{s.label}</Kicker>
              <div className="font-barlowc text-[32px] font-semibold leading-none mt-1.5">{s.value}</div>
              <div className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-1">{s.sub}</div>
            </div>
          ))}
        </div>

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
                    <Tag tone={daysSinceVisit(p) >= 30 ? "danger" : "gold"}>{daysSinceVisit(p)}d</Tag>
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
