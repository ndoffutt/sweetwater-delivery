import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLastManifestScan } from "@/lib/actions/manifest";
import { easternToday } from "@/lib/date";
import DispatchConsole, { type InitialStop } from "@/components/DispatchConsole";
import type { DeliveryDay } from "@/lib/deliveryDay";
import { isOverdueForVisit } from "@/lib/prospectVisit";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawStop {
  status: string;
  stop_order: number;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  piece_count: number | null;
  customers: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    tags: string[] | null;
    delivery_days?: DeliveryDay[] | null;
  } | null;
}

const townOf = (a: string) => a.split(",")[1]?.trim() ?? "";

export default async function DispatchPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  const today = easternToday();
  // Weekday of the route date (date-only math, timezone-proof).
  const dispatchDow = new Date(today + "T12:00:00Z").getUTCDay();

  const routeSelect = (withDay: boolean) =>
    supabase
      .from("routes")
      .select(
        `id,status,date,route_stops(stop_order,status,has_dropoff,has_pickup,notes,piece_count,customers(id,name,address,phone,lat,lng,tags${withDay ? ",delivery_days" : ""}))`
      )
      .eq("date", today)
      .is("deleted_at", null)
      .order("stop_order", { referencedTable: "route_stops" })
      .maybeSingle();

  const customersSelect = (withDay: boolean) =>
    supabase
      .from("customers")
      .select(`id,name,address,phone,lat,lng,route_seq,tags${withDay ? ",delivery_days" : ""}`)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");

  const [routeRes, lastScan, { count: signupCount }, { data: masterRows }, customersRes, recentRes] = await Promise.all([
    routeSelect(true),
    getLastManifestScan(),
    supabase
      .from("customer_signups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("customers")
      .select("name,lat,lng,route_seq")
      .eq("active", true)
      .is("deleted_at", null)
      .not("route_seq", "is", null)
      .order("route_seq"),
    customersSelect(true),
    // Recent dispatches (the actually-sent routes), newest first.
    supabase
      .from("routes")
      .select("id,date,status,source,completed_at,route_stops(status,deleted_at)")
      .in("status", ["dispatched", "in_progress", "completed"])
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(14),
  ]);

  // Tolerant of the `source` column not being migrated yet — if selecting it
  // errors, fall back to the same query without it (routes show the default
  // "scanned" icon until the migration runs).
  let recentRows: Record<string, unknown>[] | null = recentRes.data;
  if (recentRes.error) {
    const fb = await supabase
      .from("routes")
      .select("id,date,status,completed_at,route_stops(status,deleted_at)")
      .in("status", ["dispatched", "in_progress", "completed"])
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(14);
    recentRows = fb.data;
  }

  const recentRoutes = ((recentRows ?? []) as unknown as {
    id: string; date: string; status: string; source: string | null; completed_at: string | null;
    route_stops: { status: string; deleted_at: string | null }[] | null;
  }[]).map((r) => {
    // Count live (non-deleted) stops; "done" = completed (skipped stops count
    // toward the total but not the completed tally, so 4 skipped shows as 12/16).
    const live = (r.route_stops ?? []).filter((s) => !s.deleted_at);
    return {
      id: r.id,
      date: r.date,
      status: r.status,
      source: r.source ?? null,
      completedAt: r.completed_at,
      stopCount: live.length,
      completedCount: live.filter((s) => s.status === "completed").length,
    };
  });

  // Tolerant of the delivery_days migration not having run yet.
  const route = routeRes.error ? (await routeSelect(false)).data : routeRes.data;
  const allCustomerRows = customersRes.error
    ? (await customersSelect(false)).data
    : customersRes.data;

  const stops: InitialStop[] = (((route?.route_stops ?? []) as unknown) as RawStop[])
    .filter((s) => s.customers)
    .map((s) => ({
      customerId: s.customers!.id,
      name: s.customers!.name,
      address: s.customers!.address,
      town: townOf(s.customers!.address),
      phone: s.customers!.phone,
      has_dropoff: s.has_dropoff,
      has_pickup: s.has_pickup,
      notes: s.notes,
      pieces: s.piece_count ?? 0,
      lat: s.customers!.lat,
      lng: s.customers!.lng,
      vip: (s.customers!.tags ?? []).includes("VIP"),
      days: s.customers!.delivery_days ?? [],
      stopOrder: s.stop_order,
    }));

  const masterRoute = ((masterRows ?? []) as { name: string; lat: number | null; lng: number | null; route_seq: number }[])
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({ name: c.name, lat: c.lat as number, lng: c.lng as number, seq: c.route_seq }));

  const allCustomers = (((allCustomerRows ?? []) as unknown) as {
    id: string; name: string; address: string; phone: string | null;
    lat: number | null; lng: number | null; route_seq: number | null; tags: string[] | null;
    delivery_days?: DeliveryDay[] | null;
  }[]).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    lat: c.lat,
    lng: c.lng,
    route_seq: c.route_seq,
    vip: (c.tags ?? []).includes("VIP"),
    delivery_days: c.delivery_days ?? [],
  }));

  // Overdue prospects (with coordinates) — candidates to surface near the route.
  const { data: prospectRows } = await supabase
    .from("prospects")
    .select("id,name,lat,lng,status,priority,town,created_at,call_only,touchpoints:prospect_touchpoints(type,created_at)")
    .is("deleted_at", null)
    .in("status", ["new", "working", "active"])
    .not("lat", "is", null)
    // Call-only prospects are phone/email outreach only — never route or visit
    // them, even if they happen to have an address on file.
    .eq("call_only", false);
  const overdueProspects = ((prospectRows ?? []) as unknown as Prospect[])
    .filter((p) => !p.call_only && isOverdueForVisit(p))
    .map((p) => ({ id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number, town: p.town ?? null }));

  // Prospect visits attached to today's route (tolerant of the
  // route_prospect_visits migration not having run yet).
  let plannedVisits: { id: string; prospectId: string; name: string; status: string; notes: string | null; stopOrder: number | null }[] = [];
  if (route?.id) {
    const { data: pv } = await supabase
      .from("route_prospect_visits")
      .select("id, prospect_id, status, notes, stop_order, prospects(name)")
      .eq("route_id", route.id);
    plannedVisits = ((pv ?? []) as unknown as {
      id: string; prospect_id: string; status: string; notes: string | null; stop_order: number | null; prospects: { name: string } | null;
    }[]).map((r) => ({ id: r.id, prospectId: r.prospect_id, name: r.prospects?.name ?? "Prospect", status: r.status, notes: r.notes, stopOrder: r.stop_order }));
  }
  const plannedVisitIds = plannedVisits.map((v) => v.prospectId);

  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <DispatchConsole
      dateLabel={dateLabel}
      driverName="Driver"
      lastScan={lastScan}
      pendingSignups={signupCount ?? 0}
      masterRoute={masterRoute}
      allCustomers={allCustomers}
      dispatchDow={dispatchDow}
      recentRoutes={recentRoutes}
      overdueProspects={overdueProspects}
      plannedVisitIds={plannedVisitIds}
      plannedVisits={plannedVisits}
      today={route ? { id: route.id, status: route.status, stops } : null}
    />
  );
}
