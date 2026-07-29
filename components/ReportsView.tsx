"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TIMING_START_LABEL } from "@/lib/timing";
import { MAX_STOP_MIN, type TripLeg } from "@/lib/vanTrips";

export interface StopRow {
  id: string;
  routeId: string;
  date: string; // YYYY-MM-DD (Eastern calendar day of the route)
  status: string; // completed | skipped
  pieces: number;
  customerId: string | null;
  customerName: string;
  town: string | null;
  photos: number;
  arrivedAt: string | null;
  completedAt: string | null;
}
export interface TouchpointRow {
  id: string;
  prospectId: string;
  prospectName: string;
  type: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

const GREEN = "#02733e";
const GOLD = "#b8821f"; // gold-dark: better contrast on cream than gold-primary

// Parse a YYYY-MM-DD as local noon so month/week math never slips a day across
// UTC or DST boundaries.
const atNoon = (d: string) => new Date(d + "T12:00:00");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d: string) => d.slice(0, 7);

function weekStartKey(d: string) {
  const x = atNoon(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Mon-anchored
  return ymd(x);
}

const monthLabel = (key: string) =>
  new Date(key + "-01T12:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const dayLabel = (key: string) =>
  atNoon(key).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
const dayLong = (key: string) =>
  atNoon(key).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const weekLabel = (key: string) =>
  `Wk of ${atNoon(key).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}`;

interface Bucket { key: string; label: string; stops: number; items: number }

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const fmtMin = (m: number | null) =>
  m == null ? "—" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;

// ── Bar chart ──────────────────────────────────────────────────
// One measure per chart. Stops and items differ by an order of magnitude, so
// they never share an axis — two charts, same buckets, same drill target.
// Every bar carries a visible value label (required relief: gold sits under 3:1
// against cream).
function BarChart({
  buckets, color, onPick, activeKey, unit,
}: {
  buckets: Bucket[];
  color: string;
  onPick?: (key: string) => void;
  activeKey?: string | null;
  unit: "stops" | "items";
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => (unit === "stops" ? b.stops : b.items)));

  if (buckets.length === 0) {
    return (
      <div className="bg-cream rounded-xl border border-cream-dark p-8 text-center text-charcoal/40 font-body text-sm">
        No data in this range.
      </div>
    );
  }

  return (
    <div className="bg-cream rounded-xl border border-cream-dark p-4 sm:p-5">
      <div className="flex items-end gap-1.5 sm:gap-2.5 h-44 overflow-x-auto">
        {buckets.map((b) => {
          const v = unit === "stops" ? b.stops : b.items;
          const other = unit === "stops" ? b.items : b.stops;
          const isActive = activeKey === b.key;
          const isHover = hover === b.key;
          return (
            <button
              key={b.key}
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(b.key)}
              onMouseEnter={() => setHover(b.key)}
              onMouseLeave={() => setHover(null)}
              title={`${b.label}: ${b.stops} stops · ${b.items} items`}
              className={`relative flex-1 min-w-[34px] flex flex-col items-center justify-end h-full gap-1.5 rounded-lg ${onPick ? "cursor-pointer hover:bg-cream-dark/40" : "cursor-default"}`}
            >
              {/* tooltip */}
              {isHover && (
                <div className="absolute -top-1 z-10 whitespace-nowrap rounded-lg bg-charcoal px-2 py-1 text-[10px] font-body text-cream shadow-lg pointer-events-none">
                  {b.label}: {b.stops} stops · {b.items} items
                </div>
              )}
              <span className="text-[11px] font-body text-charcoal/60 tabular-nums">{v}</span>
              <div
                className="w-full transition-all"
                style={{
                  height: `${(v / max) * 100}%`,
                  minHeight: v ? 4 : 1,
                  background: color,
                  opacity: isActive ? 1 : isHover ? 0.9 : 0.72,
                  borderRadius: "4px 4px 0 0",
                }}
              />
              <span className="text-[9.5px] font-body text-charcoal/45 whitespace-nowrap leading-tight">
                {b.label}
              </span>
              <span className="sr-only">
                {b.label}: {b.stops} stops, {b.items} items, {other} other measure
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Cumulative customers line ──────────────────────────────────
function CustomerLine({ dates }: { dates: string[] }) {
  const pts = useMemo(() => {
    if (dates.length === 0) return [];
    const byMonth = new Map<string, number>();
    for (const d of dates) {
      const k = d.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
    }
    const keys = Array.from(byMonth.keys()).sort();
    // Fill gaps so the x-axis is real time, not just months that happened to
    // have signups.
    const out: { key: string; total: number }[] = [];
    const [sy, sm] = keys[0].split("-").map(Number);
    const [ey, em] = keys[keys.length - 1].split("-").map(Number);
    let running = 0;
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, (m = 1)) : m++) {
      const k = `${y}-${pad(m)}`;
      running += byMonth.get(k) ?? 0;
      out.push({ key: k, total: running });
    }
    return out;
  }, [dates]);

  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) {
    return (
      <div className="bg-cream rounded-xl border border-cream-dark p-8 text-center text-charcoal/40 font-body text-sm">
        Not enough history yet.
      </div>
    );
  }

  const W = 340, H = 160, padL = 8, padR = 8, padT = 20, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(1, ...pts.map((p) => p.total));
  const x = (i: number) => padL + (pts.length > 1 ? (i * iw) / (pts.length - 1) : iw / 2);
  const y = (v: number) => padT + (1 - v / max) * ih;
  const line = pts.map((p, i) => `${x(i)},${y(p.total)}`).join(" ");
  const area = `M ${x(0)},${padT + ih} L ${line} L ${x(pts.length - 1)},${padT + ih} Z`;
  // Label only the ends and every Nth tick — never a number on every point.
  const step = Math.max(1, Math.ceil(pts.length / 6));

  return (
    <div className="bg-cream rounded-xl border border-cream-dark p-4 sm:p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="custFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity="0.18" />
            <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#custFill)" />
        <polyline points={line} fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          const showTick = i % step === 0 || i === pts.length - 1;
          const isHover = hover === i;
          return (
            <g key={p.key}>
              {(isHover || i === pts.length - 1) && (
                <>
                  <circle cx={x(i)} cy={y(p.total)} r={4} fill="#fff" stroke={GREEN} strokeWidth={2} />
                  <text x={x(i)} y={y(p.total) - 10} textAnchor="middle" fontSize="11" fontFamily="var(--font-poppins), sans-serif" fill="rgba(26,26,26,0.65)">
                    {p.total}
                  </text>
                </>
              )}
              {showTick && (
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fontFamily="var(--font-poppins), sans-serif" fill="rgba(26,26,26,0.4)">
                  {monthLabel(p.key)}
                </text>
              )}
              {/* generous invisible hit target */}
              <rect
                x={x(i) - iw / pts.length / 2} y={padT} width={Math.max(10, iw / pts.length)} height={ih}
                fill="transparent" style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const TP_ICON: Record<string, string> = {
  call: "📞", email: "✉️", text: "💬", visit: "🚶", delivery: "🚐", note: "📝",
};

export default function ReportsView({
  stops, customerDates, touchpoints, legs = [],
}: {
  stops: StopRow[];
  customerDates: string[];
  touchpoints: TouchpointRow[];
  legs?: TripLeg[];
}) {
  // Drill path: null = all months → month → week → day
  const [month, setMonth] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  const completed = useMemo(() => stops.filter((s) => s.status === "completed"), [stops]);


  // Stops in the current drill scope.
  const scoped = useMemo(() => {
    let r = completed;
    if (month) r = r.filter((s) => monthKey(s.date) === month);
    if (week) r = r.filter((s) => weekStartKey(s.date) === week);
    if (day) r = r.filter((s) => s.date === day);
    return r;
  }, [completed, month, week, day]);

  // Buckets for the level currently being charted.
  const buckets: Bucket[] = useMemo(() => {
    const agg = new Map<string, Bucket>();
    const add = (key: string, label: string, s: StopRow) => {
      const b = agg.get(key) ?? { key, label, stops: 0, items: 0 };
      b.stops += 1;
      b.items += s.pieces;
      agg.set(key, b);
    };
    if (!month) {
      for (const s of completed) add(monthKey(s.date), monthLabel(monthKey(s.date)), s);
    } else if (!week) {
      for (const s of completed.filter((x) => monthKey(x.date) === month))
        add(weekStartKey(s.date), weekLabel(weekStartKey(s.date)), s);
    } else {
      // Keep the parent month in scope: a week straddling two months must not
      // offer day bars that the (month-scoped) detail view would then exclude.
      // This also keeps the sums nesting — days total to the week, weeks to the month.
      for (const s of completed.filter((x) => weekStartKey(x.date) === week && (!month || monthKey(x.date) === month)))
        add(s.date, dayLabel(s.date), s);
    }
    return Array.from(agg.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [completed, month, week]);

  const level: "months" | "weeks" | "days" = !month ? "months" : !week ? "weeks" : "days";
  const levelTitle = level === "months" ? "by month" : level === "weeks" ? "by week" : "by day";

  const totalStops = scoped.length;
  const totalItems = scoped.reduce((n, s) => n + s.pieces, 0);
  const totalPhotos = scoped.reduce((n, s) => n + s.photos, 0);
  const flagged = useMemo(() => {
    let r = stops.filter((s) => s.status === "skipped");
    if (month) r = r.filter((s) => monthKey(s.date) === month);
    if (week) r = r.filter((s) => weekStartKey(s.date) === week);
    if (day) r = r.filter((s) => s.date === day);
    return r.length;
  }, [stops, month, week, day]);

  // How the driving day actually went — straight from the van's own trip record,
  // so it doesn't depend on the driver tapping arrive/complete at the right time.
  const timing = useMemo(() => {
    // Restrict the legs to whatever the drill-down is showing.
    const inScope = legs.filter((l) => {
      if (day) return l.day === day;
      if (week) return weekStartKey(l.day) === week;
      if (month) return monthKey(l.day) === month;
      return true;
    });

    const drives = inScope.map((l) => l.driveMin).filter((m) => m > 0);
    const dwell = inScope
      .map((l) => l.stopAfterMin)
      .filter((m): m is number => m != null && m > 0);

    // Day out = first engine-on to last engine-off, per day.
    const byDay = new Map<string, { drive: number; stop: number; miles: number; idle: number }>();
    for (const l of inScope) {
      const cur = byDay.get(l.day) ?? { drive: 0, stop: 0, miles: 0, idle: 0 };
      cur.drive += l.driveMin;
      cur.stop += l.stopAfterMin ?? 0;
      cur.miles += l.distance ?? 0;
      cur.idle += l.idleMin;
      byDay.set(l.day, cur);
    }
    const dayLengths: number[] = [];
    byDay.forEach((v) => dayLengths.push(v.drive + v.stop));

    const medDwell = median(dwell);
    const medDrive = median(drives);
    const totalDrive = inScope.reduce((n, l) => n + l.driveMin, 0);
    const totalStop = dwell.reduce((n, m) => n + m, 0);

    return {
      medDwell,
      medDrive,
      measured: dwell.length,
      legCount: inScope.length,
      dayCount: byDay.size,
      medDay: median(dayLengths),
      miles: Math.round(inScope.reduce((n, l) => n + (l.distance ?? 0), 0)),
      idleMin: inScope.reduce((n, l) => n + l.idleMin, 0),
      hardEvents: inScope.reduce((n, l) => n + l.hardEvents, 0),
      // Of the time the van was out, how much was spent parked at stops.
      shareOnSite:
        totalDrive + totalStop > 0 ? Math.round((totalStop / (totalDrive + totalStop)) * 100) : null,
    };
  }, [legs, month, week, day]);

  // Day view: the actual drops, click through to the full delivery record.
  const dayStops = useMemo(
    () => (day ? scoped.slice().sort((a, b) => a.customerName.localeCompare(b.customerName)) : []),
    [day, scoped]
  );

  const Crumb = ({ label, onClick, last }: { label: string; onClick?: () => void; last?: boolean }) => (
    <>
      {onClick ? (
        <button onClick={onClick} className="font-body text-xs text-green-primary hover:underline underline-offset-2">
          {label}
        </button>
      ) : (
        <span className={`font-body text-xs ${last ? "text-charcoal/70" : "text-charcoal/40"}`}>{label}</span>
      )}
      {!last && <span className="text-charcoal/25 text-xs">›</span>}
    </>
  );

  const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="bg-cream rounded-xl border border-cream-dark p-3.5 text-center">
      <div className="font-serif text-2xl sm:text-3xl font-light text-charcoal tabular-nums">{value}</div>
      <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-1">{label}</div>
    </div>
  );

  return (
    <div className="p-5 md:p-8 md:max-w-3xl md:mx-auto">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
        ← Dispatch
      </Link>
      <h2 className="font-serif text-2xl font-light text-charcoal mb-1">Reports</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-5">
        Click any bar to drill in
      </p>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <Crumb label="All time" onClick={month ? () => { setMonth(null); setWeek(null); setDay(null); } : undefined} last={!month} />
        {month && <Crumb label={monthLabel(month)} onClick={week ? () => { setWeek(null); setDay(null); } : undefined} last={!week} />}
        {week && <Crumb label={weekLabel(week)} onClick={day ? () => setDay(null) : undefined} last={!day} />}
        {day && <Crumb label={dayLong(day)} last />}
      </div>

      {/* Scoped stats — these follow the drill-down */}
      {/* 2x2 on phones so the labels never clip; 4 across once there's room */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-7">
        <Stat label="Stops" value={totalStops} />
        <Stat label="Items" value={totalItems} />
        <Stat label="Photos" value={totalPhotos} />
        <Stat label="Flagged" value={flagged} />
      </div>

      {/* Time & motion — what the driving day actually looked like */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30">Time &amp; motion</h3>
        <span className="font-body text-[11px] text-charcoal/35">
          🚐 from the van
        </span>
      </div>
      <div className="bg-cream rounded-xl border border-cream-dark p-4 sm:p-5 mb-8">
        {timing.legCount === 0 ? (
          <div className="text-center py-3">
            <p className="text-sm text-charcoal/45 font-body">No timing for this range.</p>
            <p className="text-[11px] text-charcoal/35 font-body mt-1.5 max-w-sm mx-auto leading-relaxed">
              Drive and stop times come from the van&apos;s own trip record, starting
              {" "}{TIMING_START_LABEL}. Earlier numbers came only from driver taps and
              weren&apos;t reliable, so they&apos;re left out.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="text-center">
                <div className="font-serif text-2xl font-light text-charcoal">{fmtMin(timing.medDwell)}</div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-1">Typical on site</div>
              </div>
              <div className="text-center">
                <div className="font-serif text-2xl font-light text-charcoal">{fmtMin(timing.medDrive)}</div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-1">Typical drive</div>
              </div>
              <div className="text-center">
                <div className="font-serif text-2xl font-light text-charcoal">{fmtMin(timing.medDay)}</div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide mt-1">Typical day out</div>
              </div>
            </div>

            {/* How the van's day splits between parked and moving */}
            {timing.shareOnSite != null && (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px] mb-1.5">
                  <div style={{ width: `${timing.shareOnSite}%`, background: GREEN }} />
                  <div style={{ width: `${100 - timing.shareOnSite}%`, background: GOLD }} />
                </div>
                <div className="flex justify-between text-[11px] font-body text-charcoal/50 mb-3">
                  <span><span className="inline-block w-2 h-2 rounded-sm align-middle mr-1" style={{ background: GREEN }} />Parked at stops {timing.shareOnSite}%</span>
                  <span>Driving {100 - timing.shareOnSite}% <span className="inline-block w-2 h-2 rounded-sm align-middle ml-1" style={{ background: GOLD }} /></span>
                </div>
              </>
            )}

            {/* Vehicle facts the phone could never give us */}
            <div className="grid grid-cols-3 gap-2 border-t border-cream-dark pt-3 mb-3">
              <div className="text-center">
                <div className="font-body text-sm text-charcoal tabular-nums">{timing.miles}</div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide">Miles</div>
              </div>
              <div className="text-center">
                <div className="font-body text-sm text-charcoal tabular-nums">{fmtMin(timing.idleMin)}</div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide">Idling</div>
              </div>
              <div className="text-center">
                <div className={`font-body text-sm tabular-nums ${timing.hardEvents > 0 ? "text-gold-dark" : "text-charcoal"}`}>
                  {timing.hardEvents}
                </div>
                <div className="text-[10px] text-charcoal/40 font-body uppercase tracking-wide">Hard brake/accel</div>
              </div>
            </div>

            <p className="text-[11px] font-body text-charcoal/45 leading-relaxed">
              Measured by the van itself — {timing.legCount} drive
              {timing.legCount === 1 ? "" : "s"} across {timing.dayCount} day
              {timing.dayCount === 1 ? "" : "s"}. A stop is the time parked between two
              drives; gaps over {MAX_STOP_MIN} minutes count as a break, not a stop.
              Typical = median.
            </p>
          </>
        )}
      </div>

      {/* Day detail — the drops themselves */}
      {day ? (
        <>
          <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">
            {dayStops.length} drop{dayStops.length === 1 ? "" : "s"} · {dayLong(day)}
          </h3>
          <div className="bg-cream rounded-xl border border-cream-dark divide-y divide-cream-dark mb-4">
            {dayStops.length === 0 ? (
              <p className="p-6 text-center text-sm text-charcoal/40 font-body">No completed drops this day.</p>
            ) : (
              dayStops.map((s) => {
                return (
                  <Link
                    key={s.id}
                    href={`/dispatch/delivery/${s.id}`}
                    className="flex items-center gap-3 p-3.5 hover:bg-cream-dark/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-body text-sm text-charcoal truncate">{s.customerName}</div>
                      <div className="text-[11px] text-charcoal/40 font-body">
                        {s.town ?? "—"}
                        {s.pieces > 0 && ` · ${s.pieces} pcs`}
                        {s.photos > 0 && ` · ${s.photos} photo${s.photos === 1 ? "" : "s"}`}
                        {s.photos === 0 && <span className="text-gold-dark"> · no photo</span>}
                      </div>
                      {/* Clock times only — per-stop durations came from driver
                          taps and aren't trustworthy. Real drive/stop timing is
                          in Time & motion, measured by the van. */}
                      {(s.arrivedAt || s.completedAt) && (
                        <div className="text-[11px] font-body text-charcoal/45 mt-0.5">
                          {s.arrivedAt && new Date(s.arrivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          {s.arrivedAt && s.completedAt && " → "}
                          {s.completedAt && new Date(s.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                    <span className="text-charcoal/25 shrink-0">›</span>
                  </Link>
                );
              })
            )}
          </div>
          <button
            onClick={() => setDay(null)}
            className="w-full min-h-tap bg-cream border border-cream-dark rounded-xl font-body text-xs uppercase tracking-widest text-charcoal/60 py-3 mb-8"
          >
            ← Back to the week
          </button>
        </>
      ) : (
        <>
          {/* Stops */}
          <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">
            Stops {levelTitle}
          </h3>
          <div className="mb-7">
            <BarChart
              buckets={buckets}
              color={GREEN}
              unit="stops"
              onPick={(k) => (level === "months" ? setMonth(k) : level === "weeks" ? setWeek(k) : setDay(k))}
            />
          </div>

          {/* Items */}
          <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30 mb-3">
            Items dropped off {levelTitle}
          </h3>
          <div className="mb-8">
            <BarChart
              buckets={buckets}
              color={GOLD}
              unit="items"
              onPick={(k) => (level === "months" ? setMonth(k) : level === "weeks" ? setWeek(k) : setDay(k))}
            />
          </div>
        </>
      )}

      {/* Customers over time */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30">
          Delivery customers over time
        </h3>
        <span className="font-body text-xs text-charcoal/40">{customerDates.length} total</span>
      </div>
      <div className="mb-8">
        <CustomerLine dates={customerDates} />
      </div>

      {/* Touchpoints */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-body text-xs uppercase tracking-widest text-charcoal/30">Touchpoints</h3>
        <span className="font-body text-xs text-charcoal/40">{touchpoints.length} logged</span>
      </div>
      <div className="bg-cream rounded-xl border border-cream-dark divide-y divide-cream-dark mb-10">
        {touchpoints.length === 0 ? (
          <p className="p-6 text-center text-sm text-charcoal/40 font-body">No touchpoints logged yet.</p>
        ) : (
          touchpoints.slice(0, 40).map((t) => (
            <Link
              key={t.id}
              href={`/sales/prospects?id=${t.prospectId}`}
              className="flex gap-3 p-3.5 hover:bg-cream-dark/40 transition-colors"
            >
              <span className="shrink-0 text-base leading-none mt-0.5">{TP_ICON[t.type] ?? "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-body text-sm text-charcoal">{t.prospectName}</span>
                  <span className="text-[10px] font-body uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-charcoal/5 text-charcoal/50">
                    {t.type}
                  </span>
                </div>
                {t.note && <p className="text-[12.5px] text-charcoal/60 font-body mt-0.5 whitespace-pre-wrap">{t.note}</p>}
                <p className="text-[11px] text-charcoal/35 font-body mt-0.5">
                  {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {t.createdBy ? ` · ${t.createdBy}` : ""}
                </p>
              </div>
              <span className="text-charcoal/25 shrink-0">›</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
