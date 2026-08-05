import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Kicker } from "@/components/ops/Bits";
import ReportsNav from "@/components/ops/ReportsNav";

export const dynamic = "force-dynamic";

interface WeekRow {
  week_start: string;
  sweetwater_revenue: number | null;
  jrs_revenue: number | null;
  delivery_revenue: number | null;
}

const money = (n: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

const label = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Inline bar chart: one column per week, no external libraries. */
function Bars({
  rows,
  pick,
  color,
}: {
  rows: WeekRow[];
  pick: (r: WeekRow) => number | null;
  color: string;
}) {
  const vals = rows.map(pick);
  const max = Math.max(...vals.map((v) => v ?? 0), 1);
  const W = 900;
  const H = 160;
  const bw = W / Math.max(rows.length, 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full h-auto" role="img">
      {rows.map((r, i) => {
        const v = vals[i];
        const h = v == null ? 0 : Math.max((v / max) * H, v > 0 ? 2 : 0);
        return (
          <g key={r.week_start}>
            <rect x={i * bw + 2} y={H - h} width={bw - 4} height={h} fill={color} />
            {i % Math.ceil(rows.length / 12) === 0 && (
              <text
                x={i * bw + bw / 2}
                y={H + 16}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(26,26,26,.55)"
              >
                {label(r.week_start)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Revenue — weekly dollars for each business, charted from every weekly update
// on record (imported history + everything entered in the app going forward).
export default async function RevenuePage() {
  const supabase = createAdminClient();
  let rows: WeekRow[] = [];
  try {
    const { data, error } = await supabase
      .from("weekly_updates")
      .select("week_start, sweetwater_revenue, jrs_revenue, delivery_revenue")
      .order("week_start", { ascending: true });
    if (!error) rows = (data ?? []) as WeekRow[];
  } catch {
    /* table missing → empty state */
  }

  const sum = (pick: (r: WeekRow) => number | null) =>
    rows.reduce((a, r) => a + (pick(r) ?? 0), 0);
  const latest = [...rows].reverse();

  const series = [
    { key: "Sweetwater's", pick: (r: WeekRow) => r.sweetwater_revenue, color: "#02733e" },
    { key: "JRS", pick: (r: WeekRow) => r.jrs_revenue, color: "#8f6413" },
    { key: "Delivery", pick: (r: WeekRow) => r.delivery_revenue, color: "#d59a29" },
  ];

  return (
    <>
      <ReportsNav active="Revenue" />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pb-12">
        <div className="pt-8">
          <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Revenue</h1>
          <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
            Weekly dollars from every update on record · {rows.length} weeks
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-8 text-[15px] text-[rgba(26,26,26,.68)]">
            No weekly updates recorded yet — numbers entered in the{" "}
            <Link href="/reports" className="text-ops-accent underline">weekly update</Link>{" "}
            appear here.
          </p>
        ) : (
          <>
            {series.map((s) => (
              <section key={s.key} className="mt-8 border-t border-ops-text pt-3">
                <div className="flex items-baseline justify-between">
                  <Kicker>{s.key}</Kicker>
                  <span className="text-[13px] text-[rgba(26,26,26,.62)]">
                    total {money(sum(s.pick))} · latest {money(s.pick(latest[0]))}
                  </span>
                </div>
                <div className="mt-3">
                  <Bars rows={rows} pick={s.pick} color={s.color} />
                </div>
              </section>
            ))}

            <section className="mt-10 border-t border-ops-divider pt-3">
              <Kicker>Week by week</Kicker>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead>
                    <tr className="border-b border-ops-divider">
                      {["Week", "Sweetwater's", "JRS", "Delivery", ""].map((h) => (
                        <th
                          key={h}
                          className="text-left font-barlowc font-semibold uppercase text-[11px] tracking-[0.08em] text-[rgba(26,26,26,.62)] py-2 pr-4"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {latest.map((r) => (
                      <tr key={r.week_start} className="border-b border-ops-hairline">
                        <td className="py-2 pr-4">{label(r.week_start)}</td>
                        <td className="py-2 pr-4">{money(r.sweetwater_revenue)}</td>
                        <td className="py-2 pr-4">{money(r.jrs_revenue)}</td>
                        <td className="py-2 pr-4">{money(r.delivery_revenue)}</td>
                        <td className="py-2 text-right">
                          <Link href={`/reports?week=${r.week_start}`} className="text-ops-accent text-[13px]">
                            Open update
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
