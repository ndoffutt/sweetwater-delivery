"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compressImage";
import { resolveManifestStops, dispatchRoute, saveDraftRoute, clearTodaysRoute, type LastScan } from "@/lib/actions/manifest";
import type { StopResolution } from "@/lib/manifest/match";
import { routeMiles, routeEtaMinutes, formatMiles, formatDuration, cheapestInsertion, seqBetween } from "@/lib/geo";
import { dayForLocation, dayForDow, DAY_LABEL, type DeliveryDay } from "@/lib/deliveryDay";
import RouteMap from "@/components/RouteMap";
import type { RouteStop } from "@/lib/types";

export interface InitialStop {
  customerId: string;
  name: string;
  address: string;
  town: string;
  phone: string | null;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  pieces: number;
  lat: number | null;
  lng: number | null;
  vip: boolean;
  day?: DeliveryDay | null;
}

export interface MasterStop {
  name: string;
  lat: number;
  lng: number;
  seq: number;
}

export interface PickCustomer {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  route_seq: number | null;
  vip: boolean;
  delivery_day?: DeliveryDay | null;
}

interface Row {
  key: string;
  customer_name: string;
  address: string;
  town: string;
  phone: string | null;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  vip: boolean;
  pieces: number; // garments to drop off
  seq: number | null; // matched customer's master-route position
  customerId?: string | null;
  match?: StopResolution;
  merge?: string | null;
  included: boolean;
  suggested?: boolean; // unpositioned stop auto-slotted at its best geographic fit
  betweenBefore?: string;
  betweenAfter?: string;
  assignSeq?: number; // route_seq to persist for a new/unpositioned customer
  day?: DeliveryDay | null; // designated run day (Wed = east, Thu = west)
}

type Phase = "empty" | "reading" | "review" | "dispatched";

const GREEN = "#02733e";
const townOf = (a: string) => a.split(",")[1]?.trim() ?? "";
const first = (n: string) => n.trim().split(/[\s/]/)[0] || n;

let keySeq = 0;
const nextKey = () => `r${keySeq++}`;

// Order rows by master-route position. Unpositioned stops (new customers) that
// have coordinates are slotted into their best geographic fit AMONG ALL EXISTING
// CUSTOMERS (the full master route, not just this manifest), flagged "suggested",
// and given an assignSeq to persist on send. Ones without coords fall to the end.
function orderWithSuggestions(rows: Row[], master: MasterStop[]): Row[] {
  const masterPts = master.map((m) => ({ lat: m.lat, lng: m.lng }));

  const keyed = rows.map((r, mi) => {
    if (r.seq != null) {
      r.suggested = false;
      r.betweenBefore = undefined;
      r.betweenAfter = undefined;
      r.assignSeq = undefined;
      return { r, key: r.seq, mi };
    }
    if (r.lat != null && r.lng != null && master.length > 0) {
      const idx = cheapestInsertion(masterPts, { lat: r.lat, lng: r.lng });
      const before = master[idx - 1];
      const after = master[idx];
      const seq = seqBetween(before?.seq, after?.seq);
      r.suggested = true;
      r.assignSeq = seq;
      r.betweenBefore = before?.name;
      r.betweenAfter = after?.name;
      return { r, key: seq, mi };
    }
    r.suggested = false;
    r.betweenBefore = undefined;
    r.betweenAfter = undefined;
    r.assignSeq = undefined;
    return { r, key: Number.POSITIVE_INFINITY, mi };
  });

  return keyed.sort((a, b) => a.key - b.key || a.mi - b.mi).map((x) => x.r);
}

// ── icons ──────────────────────────────────────────────────────
function Ic({ d, size = 18, fill = false }: { d: string; size?: number; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const I = {
  file: "M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z M14 3v5h5",
  upload: "M12 16V4 M8 8l4-4 4 4 M5 20h14",
  send: "M21 4L3 11l7 2.5L12.5 21 21 4z",
  check: "M4 12.5l5 5L20 6.5",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  star: "M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8L12 3.5z",
  sparkle: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z",
  truck: "M3 6h10v9H3zM13 9h4l3 3v3h-7z M7 18.6a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z M17 18.6a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z",
  edit: "M4 20h4L18.5 9.5a2 2 0 00-3-3L5 17v3z",
};

export default function DispatchConsole({
  dateLabel,
  driverName,
  lastScan,
  pendingSignups = 0,
  masterRoute = [],
  allCustomers = [],
  dispatchDow,
  today,
}: {
  dateLabel: string;
  driverName: string;
  lastScan: LastScan | null;
  pendingSignups?: number;
  masterRoute?: MasterStop[];
  allCustomers?: PickCustomer[];
  dispatchDow?: number; // 0-6 weekday (Eastern) of today's route date
  today: { id: string; status: string; stops: InitialStop[] } | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const rowsFromInitial = (): Row[] =>
    (today?.stops ?? []).map((s) => ({
      key: nextKey(),
      customer_name: s.name,
      address: s.address,
      town: s.town,
      phone: s.phone,
      has_dropoff: s.has_dropoff,
      has_pickup: s.has_pickup,
      notes: s.notes,
      lat: s.lat,
      lng: s.lng,
      vip: s.vip,
      pieces: s.pieces,
      seq: null,
      customerId: s.customerId,
      merge: s.customerId,
      included: true,
      day: s.day ?? null,
    }));

  const initialPhase: Phase =
    today && (today.status === "dispatched" || today.status === "in_progress")
      ? "dispatched"
      : today && today.status === "draft" && today.stops.length
      ? "review"
      : "empty";

  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [rows, setRows] = useState<Row[]>(initialPhase === "empty" ? [] : rowsFromInitial());
  const [original, setOriginal] = useState<Row[]>([]);
  const [sel, setSel] = useState<string>("");
  const [error, setError] = useState("");
  const [readStep, setReadStep] = useState(0);
  // Key of the new-customer row whose full-route placement is being confirmed.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  // Manual route builder: "create" starts a fresh list, "add" appends to the
  // current review list. null = picker closed.
  const [picking, setPicking] = useState<null | "create" | "add">(null);

  // Animate the "reading" checklist while the manifest is parsed.
  useEffect(() => {
    if (phase !== "reading") return;
    setReadStep(0);
    const t = setInterval(() => setReadStep((s) => Math.min(s + 1, 4)), 650);
    return () => clearInterval(t);
  }, [phase]);

  async function handleFile(file: File) {
    setError("");
    setPhase("reading");
    try {
      const body =
        file.type.startsWith("image/") ? await compressImage(file, 1568, 0.85) : file;
      const fd = new FormData();
      fd.append("manifest", body, (body as File).name || file.name || "manifest");
      const res = await fetch("/api/manifest", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't read that manifest");
      const stops = (data.stops ?? []) as {
        customer_name: string;
        address: string;
        phone: string | null;
        has_dropoff: boolean;
        has_pickup: boolean;
        notes: string | null;
        piece_count?: number | null;
        lat?: number | null;
        lng?: number | null;
      }[];
      if (!stops.length) throw new Error("No stops found in that file");

      let resolutions: StopResolution[] = [];
      try {
        resolutions = await resolveManifestStops(
          stops.map((s) => ({ customer_name: s.customer_name, address: s.address, phone: s.phone }))
        );
      } catch {
        /* matching is best-effort */
      }

      const built: Row[] = stops.map((s, i) => {
        const m = resolutions[i];
        const auto = m && (m.kind === "exact" || m.kind === "phone" || m.kind === "address");
        return {
          key: nextKey(),
          customer_name: s.customer_name,
          address: s.address,
          town: townOf(s.address),
          phone: s.phone,
          has_dropoff: s.has_dropoff,
          has_pickup: s.has_pickup,
          notes: s.notes ?? null,
          lat: s.lat ?? (auto ? m?.customerLat ?? null : m?.geoLat ?? null),
          lng: s.lng ?? (auto ? m?.customerLng ?? null : m?.geoLng ?? null),
          vip: false,
          pieces: s.piece_count ?? 0,
          seq: m?.customerSeq ?? null,
          match: m,
          merge: auto ? m?.customerId ?? null : null,
          included: true,
          // Matched customers carry their designated day; brand-new ones get
          // it from geography (east of the shop = Wed, west = Thu).
          day: auto
            ? m?.customerDay ?? null
            : m?.kind === "suggested"
            ? null // unknown until the dispatcher decides merge vs. new
            : dayForLocation(s.lng ?? m?.geoLng),
        };
      });
      const ordered = orderWithSuggestions(built, masterRoute);
      setRows(ordered);
      setOriginal(ordered);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that manifest");
      setPhase("empty");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  const included = rows.filter((r) => r.included);
  const removed = rows.filter((r) => !r.included);
  const drops = included.filter((r) => r.has_dropoff).length;
  const picks = included.filter((r) => r.has_pickup).length;
  const totalPieces = included.reduce((n, r) => n + (r.pieces || 0), 0);

  function move(key: string, dir: -1 | 1) {
    setRows((cur) => {
      const inc = cur.filter((r) => r.included).map((r) => (r.key === key ? { ...r, suggested: false } : r));
      const idx = inc.findIndex((r) => r.key === key);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= inc.length) return cur;
      [inc[idx], inc[j]] = [inc[j], inc[idx]];
      return [...inc, ...cur.filter((r) => !r.included)];
    });
  }
  const toggleInc = (key: string) =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, included: !r.included } : r)));
  // Accepting a suggested match also inherits that customer's coordinates and
  // route position, so the stop pins on the map and orders correctly.
  const setMerge = (key: string, merge: string | null) =>
    setRows((cur) =>
      cur.map((r) => {
        if (r.key !== key) return r;
        const cand = r.match?.kind === "suggested" ? r.match.candidate : undefined;
        if (merge && cand && cand.id === merge) {
          return {
            ...r,
            merge,
            lat: r.lat ?? cand.lat ?? null,
            lng: r.lng ?? cand.lng ?? null,
            seq: r.seq ?? r.match?.customerSeq ?? null,
            day: cand.day ?? r.day ?? null,
          };
        }
        // Declined the suggestion -> brand-new customer: day from geography.
        return { ...r, merge, day: merge ? r.day : r.day ?? dayForLocation(r.lng) };
      })
    );
  const toggleTask = (key: string, k: "has_dropoff" | "has_pickup") =>
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, [k]: !r[k] } : r)));
  // Accept a new customer's (possibly adjusted) master-route placement from the
  // full-route confirmation modal.
  const applyPosition = (key: string, seq: number, before?: string, after?: string) =>
    setRows((cur) =>
      cur.map((r) =>
        r.key === key ? { ...r, suggested: false, assignSeq: seq, betweenBefore: before, betweenAfter: after } : r
      )
    );

  const suggestedIds = included.filter((r) => r.suggested).map((r) => r.key);

  // Wrong-day check: dispatching on a run day (Wed/Thu) flags any stop whose
  // customer belongs to the OTHER run (e.g. an East Hampton / Wednesday
  // customer on a Thursday manifest).
  const runDay = dispatchDow != null ? dayForDow(dispatchDow) : null;
  const wrongDay = (r: Row) => Boolean(runDay && r.day && r.day !== runDay);
  const wrongDayCount = included.filter(wrongDay).length;

  const coords = included.map((r) => (r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null));
  const miles = routeMiles(coords);
  const eta = routeEtaMinutes(coords);

  const mapStops = included.map((r, i) => ({
    id: r.key,
    stop_order: i + 1,
    status: "pending",
    customer: { name: r.customer_name, address: r.address, lat: r.lat, lng: r.lng },
  })) as unknown as RouteStop[];

  function send() {
    setError("");
    startTransition(async () => {
      const payload = included.map((r) => ({
        customer_name: r.customer_name,
        address: r.address,
        phone: r.phone,
        has_dropoff: r.has_dropoff,
        has_pickup: r.has_pickup,
        notes: r.notes,
        piece_count: r.pieces,
        route_seq: r.assignSeq ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        customerId: r.merge ?? r.customerId ?? null,
      }));
      const result = await dispatchRoute(payload);
      if (result.error) setError(result.error);
      else {
        setPhase("dispatched");
        router.refresh();
      }
    });
  }

  // Turn picked existing customers into route rows. New rows merge into the
  // existing customer and inherit its master-route position so the list orders
  // sensibly. Appends to the current list (when adding) or starts fresh.
  function applyPicked(ids: string[]) {
    const replace = picking === "create";
    const byId = new Map(allCustomers.map((c) => [c.id, c]));
    const built: Row[] = ids
      .map((id) => byId.get(id))
      .filter((c): c is PickCustomer => !!c)
      .map((c) => ({
        key: nextKey(),
        customer_name: c.name,
        address: c.address,
        town: townOf(c.address),
        phone: c.phone,
        has_dropoff: true,
        has_pickup: false,
        notes: null,
        lat: c.lat,
        lng: c.lng,
        vip: c.vip,
        pieces: 0,
        seq: c.route_seq,
        customerId: c.id,
        merge: c.id,
        included: true,
        day: c.delivery_day ?? null,
      }));

    setRows((cur) => {
      const base = replace ? [] : cur;
      const have = new Set(base.map((r) => r.customerId).filter(Boolean));
      const merged = [...base, ...built.filter((r) => !have.has(r.customerId))];
      // Order by master-route position; unpositioned fall to the end.
      return merged.sort(
        (a, b) => (a.seq ?? Number.POSITIVE_INFINITY) - (b.seq ?? Number.POSITIVE_INFINITY)
      );
    });
    if (replace) setOriginal([]);
    setPicking(null);
    setPhase("review");
  }

  function saveDraft() {
    setError("");
    setDraftSaved(false);
    startTransition(async () => {
      const payload = included.map((r) => ({
        customer_name: r.customer_name,
        address: r.address,
        phone: r.phone,
        has_dropoff: r.has_dropoff,
        has_pickup: r.has_pickup,
        notes: r.notes,
        piece_count: r.pieces,
        route_seq: r.assignSeq ?? null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        customerId: r.merge ?? r.customerId ?? null,
      }));
      const result = await saveDraftRoute(payload);
      if (result.error) setError(result.error);
      else {
        setDraftSaved(true);
        router.refresh();
      }
    });
  }

  function clearDispatch() {
    if (!window.confirm("Clear today's dispatch? This removes the current route so you can upload a new one.")) return;
    setError("");
    startTransition(async () => {
      await clearTodaysRoute();
      setRows([]);
      setOriginal([]);
      setSel("");
      setPhase("empty");
      router.refresh();
    });
  }

  // ── EMPTY / READING ──────────────────────────────────────────
  if (phase === "empty" || phase === "reading") {
    const steps = [
      "Manifest received",
      `Read ${rows.length || "the"} stops from the SPOT sheet`,
      "Matched to customer accounts",
      "Flagging drop-offs, pick-ups & on-demand",
      "Ordering the run",
    ];
    return (
      <div className="p-4 md:p-8 md:max-w-3xl md:mx-auto pb-24 md:pb-8">
        <input ref={fileRef} type="file" accept=".csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,text/csv,application/csv,application/vnd.ms-excel,application/pdf,image/*" onChange={onPick} className="hidden" />

        <Header dateLabel={dateLabel} />
        <SignupBanner count={pendingSignups} />

        <div
          className={`mt-5 rounded-2xl border p-6 md:p-10 text-center ${
            phase === "reading" ? "border-green-primary/40 bg-green-primary/5" : "border-dashed border-cream-dark bg-cream"
          }`}
        >
          {phase === "empty" ? (
            <>
              <div className="w-16 h-16 rounded-2xl bg-green-primary/10 flex items-center justify-center mx-auto mb-4 text-green-primary">
                <Ic d={I.upload} size={30} />
              </div>
              <h3 className="font-serif text-2xl md:text-[26px] font-light text-charcoal">Upload today&apos;s SPOT manifest</h3>
              <p className="font-body text-sm text-charcoal/55 mt-2 max-w-md mx-auto leading-relaxed">
                Input the <b>CSV export</b> from SPOT or a photo of the printed sheet, then review the route and send to the driver.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 justify-center items-center mt-6">
                <button onClick={() => fileRef.current?.click()} className="min-h-tap inline-flex items-center gap-2 bg-green-primary text-cream rounded-xl px-6 py-3.5 text-xs font-body uppercase tracking-widest">
                  <Ic d={I.upload} size={17} /> Choose CSV / photo
                </button>
              </div>
              {allCustomers.length > 0 && (
                <button onClick={() => setPicking("create")} className="mt-4 inline-flex items-center gap-2 mx-auto text-green-primary font-body text-xs uppercase tracking-widest underline underline-offset-4">
                  <Ic d={I.plus} size={15} /> Or build the list manually
                </button>
              )}
              <p className="font-body text-xs text-charcoal/40 mt-4">
                CSV or PDF export from SPOT, or a photo of the printed sheet
                {lastScan ? ` · last scanned ${new Date(lastScan.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
              </p>
            </>
          ) : (
            <div className="py-2">
              <div className="flex items-center justify-center gap-3 mb-5">
                <Spinner />
                <div className="font-serif text-xl md:text-[23px] font-light text-green-primary">Reading the SPOT manifest…</div>
              </div>
              <div className="max-w-sm mx-auto text-left flex flex-col gap-2.5">
                {steps.map((t, i) => (
                  <ParseLine key={i} text={t} done={i < readStep} active={i === readStep} />
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-center text-sm text-red-600 font-body mt-4">{error}</p>}

        {phase === "empty" && lastScan && (
          <div className="mt-4 bg-cream rounded-2xl border border-cream-dark p-4 md:p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <span className="inline-flex items-center gap-2 text-charcoal/40">
                <Ic d={I.file} size={15} />
                <span className="font-body text-[11px] uppercase tracking-widest text-charcoal/40">
                  Last scanned manifest · {new Date(lastScan.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-green-primary font-body text-xs font-medium">
                <Ic d={I.check} size={14} /> {lastScan.stopCount} stops read
              </span>
            </div>
            <div className="flex gap-4 flex-wrap md:flex-nowrap">
              {lastScan.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastScan.imageUrl} alt="scanned manifest" className="w-full md:w-36 shrink-0 rounded-lg border border-cream-dark object-cover max-h-52" />
              ) : (
                <div className="w-full md:w-36 shrink-0 rounded-lg border border-cream-dark bg-cream-dark/40 flex items-center justify-center text-charcoal/30 text-xs font-body py-8">
                  {lastScan.source.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-2">What Claude pulled from it</p>
                <div className="space-y-1.5">
                  {lastScan.stops.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-cream-dark text-charcoal/50 text-[11px] font-body flex items-center justify-center">{i + 1}</span>
                      <span className="font-body text-sm text-charcoal truncate">{s.customer_name}</span>
                      <span className="ml-auto flex gap-1 shrink-0">
                        {s.has_dropoff && <TaskChip drop />}
                        {s.has_pickup && <TaskChip />}
                      </span>
                    </div>
                  ))}
                  {lastScan.stops.length > 5 && (
                    <p className="font-body text-xs text-charcoal/40 pl-7">+ {lastScan.stops.length - 5} more</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {picking && (
          <ManualPicker
            customers={allCustomers}
            mode={picking}
            existingIds={new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])}
            onClose={() => setPicking(null)}
            onApply={applyPicked}
          />
        )}
      </div>
    );
  }

  // ── REVIEW / DISPATCHED ──────────────────────────────────────
  const dispatched = phase === "dispatched";
  return (
    <div className="p-4 md:p-8 md:max-w-5xl md:mx-auto pb-24 md:pb-8">
      <Header dateLabel={dateLabel} dispatched={dispatched} />
      <SignupBanner count={pendingSignups} />

      {!dispatched && wrongDayCount > 0 && runDay && (
        <div className="mt-5 flex items-start gap-3 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
          <span className="text-red-500 mt-0.5"><Ic d={I.x} size={18} /></span>
          <p className="font-body text-sm text-red-700">
            <b>{wrongDayCount} stop{wrongDayCount === 1 ? "" : "s"} on the wrong day.</b>{" "}
            Today is the {DAY_LABEL[runDay]} run, but the stop{wrongDayCount === 1 ? "" : "s"} marked in red below belong{wrongDayCount === 1 ? "s" : ""} to the {DAY_LABEL[runDay === "wednesday" ? "thursday" : "wednesday"]} run
            ({runDay === "wednesday" ? "west of the shop" : "East Hampton town"}). Remove {wrongDayCount === 1 ? "it" : "them"} with the ✕, or send anyway if it&apos;s intentional.
          </p>
        </div>
      )}

      {/* summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
        <Stat icon={I.sparkle} value={included.length} label="Stops" />
        <Stat icon={I.check} value={drops} label="Drop-offs" />
        <Stat icon={I.send} value={picks} label="Pick-ups" />
        {totalPieces > 0 ? <Stat icon={I.file} value={totalPieces} label="Items" /> : null}
        <div className="bg-cream rounded-xl border border-cream-dark p-4 flex items-center gap-2.5">
          <span className="text-green-primary"><Ic d={I.truck} size={20} /></span>
          <div className="min-w-0">
            <div className="font-body text-sm font-medium text-charcoal truncate">{driverName} · Van 1</div>
            <div className="font-body text-[11px] uppercase tracking-widest text-charcoal/40">Driver</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_360px] gap-4 mt-4 items-start">
        {/* list */}
        <div className="bg-cream rounded-2xl border border-cream-dark overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-cream-dark">
            <span className="inline-flex items-center gap-2 text-gold-dark">
              <Ic d={I.sparkle} size={15} fill />
              <span className="font-body text-[11px] uppercase tracking-widest text-charcoal/45">Route built by Claude · reorder</span>
            </span>
            <div className="flex items-center gap-3">
              {!dispatched && allCustomers.length > 0 && (
                <button onClick={() => setPicking("add")} className="inline-flex items-center gap-1 font-body text-xs text-green-primary font-medium">
                  <Ic d={I.plus} size={13} /> Add stops
                </button>
              )}
              {!dispatched && original.length > 0 && (
                <button onClick={() => setRows(original)} className="font-body text-xs text-green-primary font-medium">Reset order</button>
              )}
            </div>
          </div>

          <div className="p-2">
            {included.map((r, i) => (
              <div
                key={r.key}
                onClick={() => setSel(r.key)}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer ${
                  r.suggested
                    ? "bg-gold-primary/[0.07] ring-1 ring-gold-primary/40"
                    : sel === r.key
                    ? "bg-green-primary/[0.06]"
                    : ""
                }`}
              >
                {!dispatched && (
                  <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                    <button onClick={(e) => { e.stopPropagation(); move(r.key, -1); }} disabled={i === 0} className="w-6 h-5 rounded bg-cream-dark/60 text-charcoal/50 flex items-center justify-center disabled:opacity-30">
                      <Ic d="M6 14l6-6 6 6" size={13} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); move(r.key, 1); }} disabled={i === included.length - 1} className="w-6 h-5 rounded bg-cream-dark/60 text-charcoal/50 flex items-center justify-center disabled:opacity-30">
                      <Ic d="M6 10l6 6 6-6" size={13} />
                    </button>
                  </div>
                )}
                <span className={`w-7 h-7 shrink-0 rounded-full text-sm font-body flex items-center justify-center mt-0.5 ${r.suggested ? "bg-gold-primary text-charcoal" : "bg-green-primary text-cream"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-body text-[15px] font-medium text-charcoal truncate">{r.customer_name}</span>
                    {r.vip && <span className="text-gold-dark shrink-0"><Ic d={I.star} size={13} fill /></span>}
                    {!dispatched && wrongDay(r) && (
                      <span className="shrink-0 bg-red-100 text-red-700 border border-red-300 rounded px-1.5 py-0.5 text-[10px] font-body font-semibold uppercase tracking-wide">
                        {r.day === "wednesday" ? "Wed" : "Thu"} customer
                      </span>
                    )}
                  </div>
                  <div className="font-body text-xs text-charcoal/45 truncate">{r.address}{r.town ? ` · ${r.town}` : ""}{r.pieces > 0 ? ` · ${r.pieces} pc${r.pieces === 1 ? "" : "s"}` : ""}</div>
                  {/* merge / new badge */}
                  {!dispatched && r.match && <MergeBadge row={r} onMerge={(id) => setMerge(r.key, id)} onNew={() => setMerge(r.key, null)} />}
                  {/* suggested master-route position for a new/unpositioned customer */}
                  {!dispatched && r.suggested && (
                    <div className="mt-1 flex items-center gap-2 text-[11px] font-body flex-wrap">
                      <span className="text-gold-dark">
                        New customer · suggested route spot
                        {r.betweenBefore && r.betweenAfter
                          ? `, between ${r.betweenBefore} & ${r.betweenAfter}`
                          : r.betweenBefore
                          ? `, after ${r.betweenBefore}`
                          : r.betweenAfter
                          ? `, before ${r.betweenAfter}`
                          : ""}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmKey(r.key); }} className="bg-green-primary text-cream rounded px-1.5 py-0.5 uppercase tracking-wide">Confirm</button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-1">
                    {!dispatched ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); toggleTask(r.key, "has_dropoff"); }} title="Drop-off" className={`px-2 py-1 rounded-md text-[10px] font-body uppercase tracking-wide ${r.has_dropoff ? "bg-green-primary/15 text-green-dark" : "bg-cream-dark/50 text-charcoal/30"}`}>↓</button>
                        <button onClick={(e) => { e.stopPropagation(); toggleTask(r.key, "has_pickup"); }} title="Pick-up" className={`px-2 py-1 rounded-md text-[10px] font-body uppercase tracking-wide ${r.has_pickup ? "bg-gold-primary/20 text-gold-dark" : "bg-cream-dark/50 text-charcoal/30"}`}>↑</button>
                      </>
                    ) : (
                      <>
                        {r.has_dropoff && <TaskChip drop />}
                        {r.has_pickup && <TaskChip />}
                      </>
                    )}
                  </div>
                  {!dispatched && (
                    <button onClick={(e) => { e.stopPropagation(); toggleInc(r.key); }} title="Remove" className="text-charcoal/30 hover:text-red-400 p-1">
                      <Ic d={I.x} size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {removed.length > 0 && (
            <div className="border-t border-cream-dark px-4 py-3">
              <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-2">Removed</p>
              <div className="flex flex-wrap gap-2">
                {removed.map((r) => (
                  <button key={r.key} onClick={() => toggleInc(r.key)} className="inline-flex items-center gap-1.5 bg-cream-dark/40 border border-cream-dark rounded-full px-3 py-1.5 font-body text-xs text-charcoal/60">
                    <span className="text-green-primary"><Ic d={I.plus} size={13} /></span> {r.customer_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* map + send */}
        <div className="flex flex-col gap-4 md:sticky md:top-4">
          <div className="bg-cream rounded-2xl border border-cream-dark overflow-hidden">
            <div className="relative h-52">
              <RouteMap stops={mapStops} targetId={sel} onSelect={setSel} suggestedIds={suggestedIds} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-body text-[13px] text-charcoal/55">
                {miles > 0 ? `~${formatMiles(miles)} · est. ${formatDuration(eta)}` : `${included.length} stops`}
              </span>
              <span className="font-body text-xs text-green-primary font-medium">Optimized</span>
            </div>
          </div>

          {dispatched ? (
            <div className="bg-green-primary/[0.04] rounded-2xl border border-green-primary/40 p-5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-green-primary text-cream flex items-center justify-center shrink-0"><Ic d={I.check} size={22} /></span>
                <div>
                  <div className="font-serif text-lg font-light text-green-primary">Route dispatched</div>
                  <div className="font-body text-xs text-charcoal/55">Sent to {first(driverName)} · {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                </div>
              </div>
              <button onClick={() => setPhase("review")} className="w-full mt-4 inline-flex items-center justify-center gap-2 border border-cream-dark text-green-primary rounded-xl py-3 font-body text-xs uppercase tracking-widest">
                <Ic d={I.edit} size={15} /> Edit route
              </button>
              <button onClick={clearDispatch} disabled={isPending} className="w-full mt-2 inline-flex items-center justify-center gap-2 text-red-500 rounded-xl py-2.5 font-body text-xs uppercase tracking-widest disabled:opacity-60">
                <Ic d={I.x} size={15} /> {isPending ? "Clearing…" : "Clear & upload new"}
              </button>
            </div>
          ) : (
            <div className="bg-cream rounded-2xl border border-cream-dark p-4">
              <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-3">Assign &amp; send</p>
              <div className="flex items-center gap-3 bg-cream-dark/30 rounded-xl px-3 py-2.5 mb-3">
                <span className="w-9 h-9 rounded-full bg-green-primary text-cream font-body text-sm flex items-center justify-center shrink-0">{first(driverName)[0]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm font-medium text-charcoal">{first(driverName)}</div>
                  <div className="font-body text-xs text-charcoal/50">Van 1 · available</div>
                </div>
              </div>
              <button
                onClick={send}
                disabled={isPending || included.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 bg-green-primary text-cream rounded-xl py-3.5 font-body text-sm uppercase tracking-widest disabled:opacity-60"
              >
                <Ic d={I.send} size={18} /> {isPending ? "Sending…" : `Send route to ${first(driverName)}`}
              </button>
              <button
                onClick={saveDraft}
                disabled={isPending || included.length === 0}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 border border-cream-dark text-green-primary rounded-xl py-2.5 font-body text-xs uppercase tracking-widest disabled:opacity-60"
              >
                <Ic d={I.file} size={15} /> {isPending ? "Saving…" : "Save as draft"}
              </button>
              {draftSaved && <p className="text-center text-xs text-green-primary font-body mt-2">✓ Draft saved — it&apos;ll be here when you come back</p>}
              {today && (
                <button onClick={clearDispatch} disabled={isPending} className="w-full mt-2 text-center text-[11px] uppercase tracking-widest text-charcoal/40 font-body">
                  Discard &amp; start over
                </button>
              )}
              {error && <p className="text-center text-xs text-red-600 font-body mt-2">{error}</p>}
            </div>
          )}
        </div>
      </div>

      {confirmKey && (() => {
        const r = rows.find((x) => x.key === confirmKey);
        if (!r) return null;
        return (
          <PositionConfirm
            row={r}
            master={masterRoute}
            onClose={() => setConfirmKey(null)}
            onConfirm={(seq, before, after) => { applyPosition(confirmKey, seq, before, after); setConfirmKey(null); }}
          />
        );
      })()}

      {picking && (
        <ManualPicker
          customers={allCustomers}
          mode={picking}
          existingIds={new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])}
          onClose={() => setPicking(null)}
          onApply={applyPicked}
        />
      )}
    </div>
  );
}

// Full-route confirmation: show the new customer slotted among ALL existing
// customers (numbered list + map), let the dispatcher nudge it earlier/later,
// and confirm the placement for the whole route.
function PositionConfirm({
  row, master, onClose, onConfirm,
}: {
  row: Row;
  master: MasterStop[];
  onClose: () => void;
  onConfirm: (seq: number, before?: string, after?: string) => void;
}) {
  const ordered = [...master].sort((a, b) => a.seq - b.seq);
  const initialPos = ordered.filter((m) => m.seq < (row.assignSeq ?? Number.POSITIVE_INFINITY)).length;
  const [pos, setPos] = useState(Math.min(Math.max(initialPos, 0), ordered.length));

  const before = ordered[pos - 1];
  const after = ordered[pos];
  const seq = seqBetween(before?.seq, after?.seq);

  const list = [
    ...ordered.slice(0, pos).map((m) => ({ name: m.name, lat: m.lat as number | null, lng: m.lng as number | null, isNew: false })),
    { name: row.customer_name, lat: row.lat, lng: row.lng, isNew: true },
    ...ordered.slice(pos).map((m) => ({ name: m.name, lat: m.lat as number | null, lng: m.lng as number | null, isNew: false })),
  ];
  const stops = list.map((s, i) => ({
    id: s.isNew ? "__new__" : `m${i}`,
    stop_order: i + 1,
    status: "pending",
    customer: { name: s.name, address: "", lat: s.lat, lng: s.lng },
  })) as unknown as RouteStop[];

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/40 flex items-end md:items-center justify-center md:p-6" onClick={onClose}>
      <div className="bg-cream w-full md:max-w-3xl rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-cream-dark flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-serif text-xl font-light text-charcoal">Confirm route position</h3>
            <p className="font-body text-xs text-charcoal/50 mt-0.5">
              <b>{row.customer_name}</b> · stop {pos + 1} of {ordered.length + 1} in the full route
            </p>
          </div>
          <button onClick={onClose} className="text-charcoal/40 p-1.5"><Ic d={I.x} size={20} /></button>
        </div>

        {master.length > 0 && (
          <div className="relative h-52 shrink-0 border-b border-cream-dark">
            <RouteMap stops={stops} targetId="__new__" onSelect={() => {}} suggestedIds={["__new__"]} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-cream-dark bg-cream-dark/20 shrink-0">
          <button onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0} className="inline-flex items-center gap-1 min-h-tap px-3 rounded-lg bg-cream border border-cream-dark text-charcoal/70 font-body text-xs uppercase tracking-wide disabled:opacity-30">
            <Ic d="M6 14l6-6 6 6" size={13} /> Earlier
          </button>
          <span className="font-body text-[11px] text-charcoal/55 text-center px-1">
            {before && after ? <>between <b>{before.name}</b> &amp; <b>{after.name}</b></> : before ? <>after <b>{before.name}</b></> : after ? <>before <b>{after.name}</b></> : "first stop"}
          </span>
          <button onClick={() => setPos((p) => Math.min(ordered.length, p + 1))} disabled={pos === ordered.length} className="inline-flex items-center gap-1 min-h-tap px-3 rounded-lg bg-cream border border-cream-dark text-charcoal/70 font-body text-xs uppercase tracking-wide disabled:opacity-30">
            Later <Ic d="M6 10l6 6 6-6" size={13} />
          </button>
        </div>

        <div className="overflow-auto p-2.5 flex-1">
          {list.map((s, i) => (
            <div key={i} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${s.isNew ? "bg-gold-primary/15 ring-1 ring-gold-primary/40" : ""}`}>
              <span className={`w-6 h-6 shrink-0 rounded-full text-[11px] font-body flex items-center justify-center ${s.isNew ? "bg-gold-primary text-charcoal" : "bg-green-primary text-cream"}`}>{i + 1}</span>
              <span className="font-body text-sm text-charcoal truncate">{s.name}</span>
              {s.isNew && <span className="ml-auto shrink-0 font-body text-[10px] uppercase tracking-widest text-gold-dark">New</span>}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-cream-dark shrink-0">
          <button onClick={() => onConfirm(seq, before?.name, after?.name)} className="w-full inline-flex items-center justify-center gap-2 bg-green-primary text-cream rounded-xl py-3.5 font-body text-xs uppercase tracking-widest">
            <Ic d={I.check} size={16} /> Confirm position {pos + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

// Manual route builder: search the customer directory and tick the stops for
// today's run. Used to create a route from scratch or add stops to one in review.
function ManualPicker({
  customers, mode, existingIds, onClose, onApply,
}: {
  customers: PickCustomer[];
  mode: "create" | "add";
  existingIds: Set<string>;
  onClose: () => void;
  onApply: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const list = customers
    .filter((c) => !existingIds.has(c.id))
    .filter((c) => {
      if (!q) return true;
      const t = q.toLowerCase();
      return c.name.toLowerCase().includes(t) || c.address.toLowerCase().includes(t);
    })
    .sort((a, b) => {
      const ai = a.route_seq ?? Number.POSITIVE_INFINITY;
      const bi = b.route_seq ?? Number.POSITIVE_INFINITY;
      return ai !== bi ? ai - bi : a.name.localeCompare(b.name);
    });

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/40 flex items-end md:items-center justify-center md:p-6" onClick={onClose}>
      <div className="bg-cream w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-cream-dark flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-serif text-xl font-light text-charcoal">{mode === "create" ? "Build dispatch manually" : "Add stops"}</h3>
            <p className="font-body text-xs text-charcoal/50 mt-0.5">Tick the customers for today&apos;s route · {list.length} available</p>
          </div>
          <button onClick={onClose} className="text-charcoal/40 p-1.5"><Ic d={I.x} size={20} /></button>
        </div>
        <div className="p-3 border-b border-cream-dark shrink-0">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or address…" className="w-full p-2.5 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary" />
        </div>
        <div className="overflow-auto p-2 flex-1">
          {list.map((c) => {
            const on = sel.has(c.id);
            return (
              <button key={c.id} onClick={() => toggle(c.id)} className={`w-full text-left flex items-center gap-3 p-2.5 rounded-xl border mb-1.5 ${on ? "bg-green-primary/[0.06] border-green-primary/40" : "bg-cream border-cream-dark"}`}>
                <span className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${on ? "bg-green-primary border-green-primary text-cream" : "border-cream-dark text-transparent"}`}><Ic d={I.check} size={12} /></span>
                {c.route_seq != null && <span className="w-6 h-6 shrink-0 rounded-full bg-cream-dark text-charcoal/50 text-[11px] font-body flex items-center justify-center">{Math.round(c.route_seq)}</span>}
                <span className="flex-1 min-w-0">
                  <span className="font-body text-sm font-medium text-charcoal truncate flex items-center gap-1.5">{c.vip && <span className="text-gold-dark"><Ic d={I.star} size={12} fill /></span>}{c.name}</span>
                  <span className="block font-body text-xs text-charcoal/45 truncate">{c.address}</span>
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className="text-center text-charcoal/40 font-body py-8 text-sm">No customers match.</p>}
        </div>
        <div className="p-4 border-t border-cream-dark shrink-0">
          <button onClick={() => onApply(Array.from(sel))} disabled={sel.size === 0} className="w-full inline-flex items-center justify-center gap-2 bg-green-primary text-cream rounded-xl py-3.5 font-body text-xs uppercase tracking-widest disabled:opacity-50">
            <Ic d={I.plus} size={16} /> {mode === "create" ? `Build route · ${sel.size} stop${sel.size === 1 ? "" : "s"}` : `Add ${sel.size} stop${sel.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── small pieces ───────────────────────────────────────────────
function SignupBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link
      href="/dispatch/signups"
      className="mt-4 flex items-center justify-between gap-3 bg-gold-primary/15 border border-gold-primary/40 rounded-xl px-4 py-3"
    >
      <span className="font-body text-sm text-charcoal">
        {count} new website signup{count === 1 ? "" : "s"} to review
      </span>
      <span className="font-body text-xs text-gold-dark uppercase tracking-widest shrink-0">Review →</span>
    </Link>
  );
}

function Header({ dateLabel, dispatched }: { dateLabel: string; dispatched?: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-serif text-3xl md:text-[34px] font-light text-charcoal leading-none">Today&apos;s Dispatch</h2>
        {dispatched && (
          <span className="inline-flex items-center gap-1.5 bg-green-primary/10 text-green-primary rounded-full px-3 py-1 font-body text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-primary" /> Dispatched
          </span>
        )}
      </div>
      <p className="font-body text-sm text-charcoal/45 w-full">{dateLabel}</p>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="bg-cream rounded-xl border border-cream-dark p-4">
      <div className="flex items-start justify-between">
        <div className="font-serif text-3xl font-light text-charcoal leading-none">{value}</div>
        <span className="text-charcoal/30"><Ic d={icon} size={18} /></span>
      </div>
      <div className="font-body text-[11px] uppercase tracking-widest text-charcoal/40 mt-2">{label}</div>
    </div>
  );
}

function TaskChip({ drop }: { drop?: boolean }) {
  return drop ? (
    <span className="inline-flex items-center gap-0.5 bg-green-primary/15 text-green-dark rounded px-1.5 py-0.5 text-[10px] font-body">↓ Drop-off</span>
  ) : (
    <span className="inline-flex items-center gap-0.5 bg-gold-primary/20 text-gold-dark rounded px-1.5 py-0.5 text-[10px] font-body">↑ Pick-up</span>
  );
}

function MergeBadge({ row, onMerge, onNew }: { row: Row; onMerge: (id: string) => void; onNew: () => void }) {
  const m = row.match!;
  if (row.merge) {
    const name = m.customerName ?? m.candidate?.name ?? "existing";
    const via = m.kind === "exact" ? "name" : m.kind === "phone" ? "phone" : m.kind === "address" ? "address" : "match";
    return (
      <div className="mt-1 inline-flex items-center gap-2 text-[11px] font-body">
        <span className="text-green-dark">→ Merging into <b>{name}</b> · via {via}</span>
        <button onClick={(e) => { e.stopPropagation(); onNew(); }} className="text-charcoal/40 uppercase tracking-wide">New</button>
      </div>
    );
  }
  const cand = m.kind === "suggested" ? m.candidate : m.customerId ? { id: m.customerId, name: m.customerName ?? "existing" } : null;
  if (cand) {
    return (
      <div className="mt-1 inline-flex items-center gap-2 text-[11px] font-body">
        <span className="text-gold-dark">Possible match: <b>{cand.name}</b></span>
        <button onClick={(e) => { e.stopPropagation(); onMerge(cand.id); }} className="bg-green-primary text-cream rounded px-1.5 py-0.5 uppercase tracking-wide">Merge</button>
      </div>
    );
  }
  return <div className="mt-1 text-[11px] font-body text-charcoal/35 uppercase tracking-widest">New customer</div>;
}

function ParseLine({ text, done, active }: { text: string; done: boolean; active: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 font-body text-sm ${done ? "text-charcoal" : active ? "text-charcoal" : "text-charcoal/35"}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-green-primary text-cream" : active ? "border-2 border-green-primary/40" : "border border-cream-dark"}`}>
        {done ? <Ic d={I.check} size={12} /> : active ? <span className="w-1.5 h-1.5 rounded-full bg-green-primary animate-pulse" /> : null}
      </span>
      {text}
    </div>
  );
}

function Spinner() {
  return <span className="w-6 h-6 rounded-full border-2 border-green-primary/25 border-t-green-primary animate-spin inline-block" style={{ borderTopColor: GREEN }} />;
}
