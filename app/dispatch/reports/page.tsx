import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import ReportsView, { type StopRow, type TouchpointRow } from "@/components/ReportsView";
import { loadVanTrips, deriveLegs, syncVanTripsIfStale } from "@/lib/vanTrips";
import { easternDay } from "@/lib/date";
import { TIMING_START } from "@/lib/timing";

export const dynamic = "force-dynamic";

type Client = ReturnType<typeof createAdminClient>;

// PostgREST caps a response at 1000 rows; page through so multi-year history is
// complete rather than silently truncated (which would understate every chart).
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  const SIZE = 1000;
  for (let from = 0; from < 50_000; from += SIZE) {
    const { data } = await build(from, from + SIZE - 1);
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < SIZE) break;
  }
  return out;
}

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  // Reports are owner-only (Nate). Managers and drivers can't reach it, even by
  // typing the URL.
  if (session.role !== "admin") redirect("/dispatch");

  const supabase: Client = createAdminClient();

  // Route dates keyed by id — stops carry no date of their own.
  const routeRows = await pageAll<{ id: string; date: string }>((from, to) =>
    supabase.from("routes").select("id,date").is("deleted_at", null).range(from, to)
  );
  const dateFor = new Map(routeRows.map((r) => [r.id, r.date]));

  const rawStops = await pageAll<{
    id: string;
    route_id: string;
    status: string;
    piece_count: number | null;
    customer_id: string | null;
    dropoff_confirmed: boolean | null;
    arrived_at: string | null;
    completed_at: string | null;
    customers: { name: string; address: string } | null;
    stop_photos: { id: string }[] | null;
  }>((from, to) =>
    supabase
      .from("route_stops")
      .select("id,route_id,status,piece_count,customer_id,dropoff_confirmed,arrived_at,completed_at,customers(name,address),stop_photos(id)")
      .in("status", ["completed", "skipped"])
      .is("deleted_at", null)
      .range(from, to)
  );

  const stops: StopRow[] = rawStops.flatMap((s) => {
    const date = dateFor.get(s.route_id);
    if (!date) return [];
    return [{
      id: s.id,
      routeId: s.route_id,
      date,
      status: s.status,
      pieces: s.piece_count ?? 0,
      customerId: s.customer_id,
      customerName: s.customers?.name ?? "Unknown",
      town: s.customers?.address?.split(",")[1]?.trim() ?? null,
      photos: s.stop_photos?.length ?? 0,
      arrivedAt: s.arrived_at,
      completedAt: s.completed_at,
    }];
  });

  // Delivery customers over time (cumulative line).
  const custRows = await pageAll<{ created_at: string }>((from, to) =>
    supabase.from("customers").select("created_at").is("deleted_at", null).range(from, to)
  );
  const customerDates = custRows
    .map((c) => c.created_at)
    .filter((d): d is string => Boolean(d))
    .sort();

  // Touchpoints — what outreach happened and what was said.
  const rawTps = await pageAll<{
    id: string;
    prospect_id: string;
    type: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
    prospects: { name: string } | null;
  }>((from, to) =>
    supabase
      .from("prospect_touchpoints")
      .select("id,prospect_id,type,note,created_by,created_at,prospects(name)")
      .order("created_at", { ascending: false })
      .range(from, to)
  );
  const touchpoints: TouchpointRow[] = rawTps.map((t) => ({
    id: t.id,
    prospectId: t.prospect_id,
    prospectName: t.prospects?.name ?? "Unknown",
    type: t.type,
    note: t.note,
    createdBy: t.created_by,
    createdAt: t.created_at,
  }));

  // Van trips are the device-truthful source for drive and on-site time. Top up
  // recent trips on view (cheap: one week-window request, upserted by id) so the
  // report is current even before the nightly cron has run. Failures are silent —
  // the report still renders from whatever is already stored.
  await syncVanTripsIfStale(120).catch(() => null);
  const legs = deriveLegs(
    await loadVanTrips(TIMING_START + "T00:00:00Z"),
    (iso) => easternDay(new Date(iso))
  );

  return (
    <ReportsView
      stops={stops}
      customerDates={customerDates}
      touchpoints={touchpoints}
      legs={legs}
    />
  );
}
