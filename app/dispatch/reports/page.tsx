import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternToday } from "@/lib/date";

export const dynamic = "force-dynamic";

interface RawStop {
  status: string;
  piece_count: number | null;
  customers: { name: string; address: string } | null;
  stop_photos: { storage_path: string }[] | null;
  routes: { date: string } | null;
}

const GREEN = "#02733e";
const GOLD = "#d59a29";

// Local YYYY-MM-DD for a Date.
const ymd = (d: Date) => d.toISOString().split("T")[0];

// Monday-anchored start of the week containing `d`.
function weekStart(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  // Reports hidden from the manager for now — block direct URL access too.
  if (session.role === "dispatcher") redirect("/dispatch");

  const supabase = createAdminClient();

  // Last 5 weeks (Mon-anchored) window. Anchor "now" to the Eastern calendar day
  // (at noon, to stay clear of UTC/DST edges) so week buckets line up with route
  // dates, which are stored as Eastern calendar days.
  const thisWeek = weekStart(new Date(easternToday() + "T12:00:00"));
  const fiveWeeksAgo = new Date(thisWeek);
  fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 7 * 4); // start of the 5th-most-recent week

  const { data } = await supabase
    .from("route_stops")
    .select("status,piece_count,customers(name,address),stop_photos(storage_path),routes(date)")
    .in("status", ["completed", "skipped"])
    .gte("routes.date", ymd(fiveWeeksAgo))
    .limit(2000);

  const stops = ((data ?? []) as unknown as RawStop[]).filter((s) => s.routes?.date);

  // --- Customer growth (cumulative signups over the last 6 months) ---
  const { data: custRows } = await supabase
    .from("customers")
    .select("created_at")
    .is("deleted_at", null);
  const createdDates = ((custRows ?? []) as { created_at: string }[])
    .map((c) => new Date(c.created_at))
    .filter((d) => !isNaN(d.getTime()));

  // --- Website signups (all statuses) ---
  const { data: signupRows } = await supabase
    .from("customer_signups")
    .select("id, full_name, status, created_at, customer_id")
    .order("created_at", { ascending: false });
  const signups = (signupRows ?? []) as { id: string; full_name: string; status: string; created_at: string; customer_id: string | null }[];
  const signupTotal = signups.length;
  const signupPending = signups.filter((s) => s.status === "pending").length;
  const signupAdded = signups.filter((s) => s.status === "added").length;
  const recentSignups = signups.slice(0, 8);

  const nowET = new Date(easternToday() + "T12:00:00");
  const growth: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(nowET.getFullYear(), nowET.getMonth() - i, 1);
    const nextMonth = new Date(nowET.getFullYear(), nowET.getMonth() - i + 1, 1);
    growth.push({
      label: monthStart.toLocaleDateString("en-US", { month: "short" }),
      total: createdDates.filter((d) => d < nextMonth).length,
    });
  }
  const growthMax = Math.max(1, ...growth.map((g) => g.total));
  const totalCustomers = createdDates.length;

  // Line-chart geometry.
  const GW = 320, GH = 150, gPadL = 12, gPadR = 12, gPadT = 16, gPadB = 26;
  const gInnerW = GW - gPadL - gPadR;
  const gInnerH = GH - gPadT - gPadB;
  const gx = (i: number) => gPadL + (growth.length > 1 ? (i * gInnerW) / (growth.length - 1) : gInnerW / 2);
  const gy = (v: number) => gPadT + (1 - v / growthMax) * gInnerH;
  const gBottom = gPadT + gInnerH;
  const linePts = growth.map((g, i) => `${gx(i)},${gy(g.total)}`).join(" ");
  const areaPath = `M ${gx(0)},${gBottom} L ${linePts} L ${gx(growth.length - 1)},${gBottom} Z`;

  // --- Weekly buckets (last 5 weeks) ---
  const weeks: { label: string; start: string; delivered: number; pieces: number }[] = [];
  for (let i = 4; i >= 0; i--) {
    const ws = new Date(thisWeek);
    ws.setDate(ws.getDate() - 7 * i);
    weeks.push({
      label: ws.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      start: ymd(ws),
      delivered: 0,
      pieces: 0,
    });
  }
  const bucketFor = (date: string) => {
    const ws = ymd(weekStart(new Date(date + "T12:00:00")));
    return weeks.find((w) => w.start === ws);
  };

  let deliveredThisWeek = 0;
  let photosThisWeek = 0;
  let flaggedThisWeek = 0;
  let itemsThisWeek = 0;
  const thisWeekStart = ymd(thisWeek);

  const byCustomer: Record<string, number> = {};
  const byTown: Record<string, number> = {};

  for (const s of stops) {
    const date = s.routes!.date;
    const completed = s.status === "completed";
    const photos = s.stop_photos?.length ?? 0;
    const inThisWeek = ymd(weekStart(new Date(date + "T12:00:00"))) === thisWeekStart;

    if (completed) {
      const b = bucketFor(date);
      if (b) { b.delivered += 1; b.pieces += s.piece_count ?? 0; }
      const name = s.customers?.name ?? "Unknown";
      byCustomer[name] = (byCustomer[name] ?? 0) + 1;
      const town = s.customers?.address?.split(",")[1]?.trim();
      if (town) byTown[town] = (byTown[town] ?? 0) + 1;
    }

    if (inThisWeek) {
      if (completed) deliveredThisWeek += 1;
      if (completed) itemsThisWeek += s.piece_count ?? 0;
      if (s.status === "skipped") flaggedThisWeek += 1;
      photosThisWeek += photos;
    }
  }

  const maxWeek = Math.max(1, ...weeks.map((w) => w.delivered));
  const maxPieces = Math.max(1, ...weeks.map((w) => w.pieces));
  const topCustomers = Object.entries(byCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const townMax = Math.max(1, ...Object.values(byTown));
  const towns = Object.entries(byTown).sort((a, b) => b[1] - a[1]);

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="bg-cream rounded-xl border border-cream-dark p-4 text-center">
      <div className="font-serif text-3xl font-light text-charcoal">{value}</div>
      <div className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-1">{label}</div>
    </div>
  );

  return (
    <div className="p-5 md:p-8 md:max-w-3xl md:mx-auto">
      <h2 className="font-serif text-2xl font-light text-charcoal mb-1">Reports</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-6">This week &amp; trends</p>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Stops" value={deliveredThisWeek} />
        <Stat label="Items" value={itemsThisWeek} />
        <Stat label="Photos" value={photosThisWeek} />
        <Stat label="Flagged" value={flaggedThisWeek} />
      </div>

      {/* Website signups */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30">Website signups</h3>
        <Link href="/dispatch/signups" className="font-body text-xs text-green-primary">See all ›</Link>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Total" value={signupTotal} />
        <Stat label="New" value={signupPending} />
        <Stat label="Became customers" value={signupAdded} />
      </div>
      {recentSignups.length > 0 && (
        <div className="bg-cream rounded-xl border border-cream-dark p-4 space-y-2.5 mb-8">
          {recentSignups.map((s) => (
            <Link
              key={s.id}
              href={s.status === "added" && s.customer_id ? `/dispatch/customers?id=${s.customer_id}` : "/dispatch/signups"}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-body text-sm text-charcoal truncate">{s.full_name}</span>
                <span className={`shrink-0 text-[10px] font-body uppercase tracking-wide px-1.5 py-0.5 rounded-full ${s.status === "added" ? "bg-green-primary/10 text-green-primary" : s.status === "pending" ? "bg-gold-primary/20 text-gold-dark" : "bg-charcoal/5 text-charcoal/40"}`}>
                  {s.status === "added" ? "Customer" : s.status === "pending" ? "New" : "Dismissed"}
                </span>
              </div>
              <span className="font-body text-xs text-charcoal/40 shrink-0">{new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Stops per week */}
      <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">Stops per week</h3>
      <div className="bg-cream rounded-xl border border-cream-dark p-5 mb-8">
        <div className="flex items-end justify-between gap-3 h-40">
          {weeks.map((w) => (
            <div key={w.start} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
              <span className="text-xs font-body text-charcoal/50">{w.delivered}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${(w.delivered / maxWeek) * 100}%`,
                  minHeight: w.delivered ? 4 : 0,
                  background: GREEN,
                  opacity: w.start === thisWeekStart ? 1 : 0.45,
                }}
              />
              <span className="text-[10px] font-body text-charcoal/40 whitespace-nowrap">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Items delivered per week */}
      <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">Items delivered per week</h3>
      <div className="bg-cream rounded-xl border border-cream-dark p-5 mb-8">
        <div className="flex items-end justify-between gap-3 h-40">
          {weeks.map((w) => (
            <div key={w.start} className="flex-1 flex flex-col items-center justify-end h-full gap-2">
              <span className="text-xs font-body text-charcoal/50">{w.pieces}</span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${(w.pieces / maxPieces) * 100}%`,
                  minHeight: w.pieces ? 4 : 0,
                  background: GOLD,
                  opacity: w.start === thisWeekStart ? 1 : 0.5,
                }}
              />
              <span className="text-[10px] font-body text-charcoal/40 whitespace-nowrap">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery customers over time */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30">Delivery customers over time</h3>
        <span className="font-body text-xs text-charcoal/40">{totalCustomers} total</span>
      </div>
      <div className="bg-cream rounded-xl border border-cream-dark p-5 mb-8">
        <svg viewBox={`0 0 ${GW} ${GH}`} className="w-full" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="custFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GREEN} stopOpacity="0.18" />
              <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#custFill)" />
          <polyline
            points={linePts}
            fill="none"
            stroke={GREEN}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {growth.map((g, i) => (
            <g key={g.label + i}>
              <circle cx={gx(i)} cy={gy(g.total)} r={3.5} fill="#fff" stroke={GREEN} strokeWidth={2} />
              <text x={gx(i)} y={gy(g.total) - 9} textAnchor="middle" fontSize="11" fontFamily="Jost, sans-serif" fill="rgba(26,26,26,0.55)">
                {g.total}
              </text>
              <text x={gx(i)} y={GH - 8} textAnchor="middle" fontSize="10" fontFamily="Jost, sans-serif" fill="rgba(26,26,26,0.4)">
                {g.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Busiest customers */}
        <div>
          <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">Busiest customers</h3>
          <div className="bg-cream rounded-xl border border-cream-dark p-4 space-y-2.5">
            {topCustomers.length === 0 ? (
              <p className="text-sm text-charcoal/40 font-body text-center py-4">No data yet.</p>
            ) : (
              topCustomers.map(([name, n]) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <span className="font-body text-sm text-charcoal truncate">{name}</span>
                  <span className="font-body text-xs text-charcoal/40 shrink-0">{n} visits</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* By town */}
        <div>
          <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">By town</h3>
          <div className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3">
            {towns.length === 0 ? (
              <p className="text-sm text-charcoal/40 font-body text-center py-4">No data yet.</p>
            ) : (
              towns.map(([town, n]) => (
                <div key={town}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-body text-sm text-charcoal">{town}</span>
                    <span className="font-body text-xs text-charcoal/40">{n}</span>
                  </div>
                  <div className="h-1.5 bg-cream-dark rounded-full overflow-hidden">
                    <div className="h-full bg-gold-primary rounded-full" style={{ width: `${(n / townMax) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
