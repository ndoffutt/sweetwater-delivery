"use client";

// Weekly revenue entry. This used to sit inside the weekly update's Growth
// section, which put a data-entry form in the middle of a conversation about
// the business. It lives next to the charts it feeds instead.
//
// The company format needs four labelled values per line — an unlabelled
// single number once made a business running +15% read as flat — so the
// derived table stays with the inputs rather than only in the emailed copy.
import { useMemo, useRef, useState, useTransition } from "react";
import { saveWeeklyRevenue } from "@/lib/actions/weekly";
import { GOAL_MULTIPLIER, DELIVERY_GOAL_PCT } from "@/lib/weeklyUpdate";
import { Tag, btnPrimary, btnSecondary, inputCls } from "@/components/ops/Bits";

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9.-]/g, "")));
const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const pct = (n: number | null) =>
  n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(n >= 10 || n <= -10 ? 1 : 2)}%`;

export interface RevenueWeek {
  week_start: string;
  sweetwater_revenue: number | null;
  sweetwater_ytd: number | null;
  sweetwater_ytd_prior: number | null;
  jrs_revenue: number | null;
  jrs_ytd: number | null;
  jrs_ytd_prior: number | null;
  delivery_revenue: number | null;
  delivery_ytd: number | null;
}

export default function RevenueEntry({ week, weekStart }: { week: RevenueWeek | null; weekStart: string }) {
  const [swWeek, setSwWeek] = useState(String(week?.sweetwater_revenue ?? ""));
  const [swYtd, setSwYtd] = useState(String(week?.sweetwater_ytd ?? ""));
  const [swPrior, setSwPrior] = useState(String(week?.sweetwater_ytd_prior ?? ""));
  const [jrsWeek, setJrsWeek] = useState(String(week?.jrs_revenue ?? ""));
  const [jrsYtd, setJrsYtd] = useState(String(week?.jrs_ytd ?? ""));
  const [jrsPrior, setJrsPrior] = useState(String(week?.jrs_ytd_prior ?? ""));
  const [delWeek, setDelWeek] = useState(String(week?.delivery_revenue ?? ""));
  const [delYtd, setDelYtd] = useState(String(week?.delivery_ytd ?? ""));

  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  // SPOT "Outgoing Summary" import — fills the inputs from a screenshot/PDF.
  // A week-long range fills the weekly fields, a Jan-1-anchored range the YTD.
  const spotInput = useRef<HTMLInputElement>(null);
  const [spotBusy, setSpotBusy] = useState(false);
  const [spotNote, setSpotNote] = useState("");

  async function importSpot(file: File) {
    setSpotBusy(true);
    setSpotNote("Reading the export…");
    try {
      const fd = new FormData();
      fd.append("export", file);
      const r = await fetch("/api/reports/spot-extract", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn't read that file");
      const rev = d.revenue as { span: "week" | "ytd"; sweetwater: number; delivery: number };
      if (rev.span === "ytd") {
        setSwYtd(String(rev.sweetwater));
        setDelYtd(String(rev.delivery));
        setSpotNote(`Filled YTD: Sweetwater's ${money(rev.sweetwater)}, delivery ${money(rev.delivery)}.`);
      } else {
        setSwWeek(String(rev.sweetwater));
        setDelWeek(String(rev.delivery));
        setSpotNote(`Filled this week: Sweetwater's ${money(rev.sweetwater)}, delivery ${money(rev.delivery)}. Upload a Jan-1-to-date export to fill YTD.`);
      }
    } catch (e) {
      setSpotNote(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setSpotBusy(false);
      if (spotInput.current) spotInput.current.value = "";
    }
  }

  const rows = useMemo(() => {
    const build = (label: string, weekS: string, ytdS: string, priorS: string, mult: number) => {
      const ytd = num(ytdS), prior = num(priorS);
      if (ytd == null || prior == null || prior === 0)
        return { label, week: num(weekS), vsPrior: null as number | null, vsGoal: null as number | null, dollar: null as number | null };
      const goal = prior * mult;
      return { label, week: num(weekS), vsPrior: ((ytd - prior) / prior) * 100, vsGoal: ((ytd - goal) / goal) * 100, dollar: ytd - goal };
    };
    const sw = build("Sweetwater's", swWeek, swYtd, swPrior, GOAL_MULTIPLIER.sweetwater);
    const jrs = build("JRS", jrsWeek, jrsYtd, jrsPrior, GOAL_MULTIPLIER.jrs);
    const dYtd = num(delYtd), swY = num(swYtd);
    return {
      sw, jrs,
      delivery: {
        week: num(delWeek),
        share: dYtd != null && swY ? (dYtd / swY) * 100 : null,
        gap: dYtd != null && swY ? swY * (DELIVERY_GOAL_PCT / 100) - dYtd : null,
      },
    };
  }, [swWeek, swYtd, swPrior, jrsWeek, jrsYtd, jrsPrior, delWeek, delYtd]);

  function save() {
    setErr("");
    start(async () => {
      const r = await saveWeeklyRevenue({
        week_start: weekStart,
        sweetwater_revenue: num(swWeek), sweetwater_ytd: num(swYtd), sweetwater_ytd_prior: num(swPrior),
        jrs_revenue: num(jrsWeek), jrs_ytd: num(jrsYtd), jrs_ytd_prior: num(jrsPrior),
        delivery_revenue: num(delWeek), delivery_ytd: num(delYtd),
      });
      if (r?.error) { setErr(r.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  if (!open) {
    return (
      <div className="border border-ops-divider p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-barlow text-[15px]">Enter this week&apos;s figures</p>
          <p className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-0.5">
            Week of {weekStart}
            {week?.sweetwater_revenue != null ? ` · Sweetwater's ${money(week.sweetwater_revenue)} saved` : " · nothing saved yet"}
          </p>
        </div>
        <button className={btnPrimary} onClick={() => setOpen(true)}>Open</button>
      </div>
    );
  }

  return (
    <div className="border border-ops-divider p-4 mb-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="font-barlowc font-semibold uppercase tracking-[0.06em] text-[14px]">
          Week of {weekStart}
        </p>
        <div className="flex items-center gap-3">
          <button className={btnSecondary} disabled={spotBusy} onClick={() => spotInput.current?.click()}>
            {spotBusy ? "Reading…" : "Import SPOT export"}
          </button>
          <Tag tone="accent">four values per line, always</Tag>
        </div>
      </div>
      <input
        ref={spotInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importSpot(f); }}
      />
      {spotNote && <p className="mt-2 text-[13px] text-[rgba(26,26,26,.68)]">{spotNote}</p>}
      {err && <p className="mt-2 text-[13px] text-ops-danger">{err}</p>}

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

      <div className="mt-4 flex items-center gap-3">
        <button className={btnPrimary} disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save figures"}
        </button>
        <button className={btnSecondary} onClick={() => setOpen(false)}>Close</button>
        {saved && <span className="text-[13px] text-ops-accent">Saved</span>}
      </div>
    </div>
  );
}
