import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import HistoryView, { type HistoryRoute } from "@/components/HistoryView";

export const dynamic = "force-dynamic";

interface RawStop {
  id: string;
  stop_order: number;
  status: string;
  arrived_at: string | null;
  completed_at: string | null;
  dropoff_confirmed: boolean;
  pickup_confirmed: boolean;
  notes: string | null;
  piece_count: number | null;
  customers: { id: string; name: string; address: string; lat: number | null; lng: number | null } | null;
  stop_photos: { storage_path: string }[] | null;
}
interface RawRoute {
  id: string;
  date: string;
  completed_at: string | null;
  route_stops: RawStop[] | null;
  driver_locations: { lat: number; lng: number }[] | null;
}
interface RawProspectVisit {
  id: string;
  route_id: string;
  status: string;
  notes: string | null;
  visited_at: string | null;
  prospects: { id: string; name: string; address: string | null } | null;
}

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("routes")
    .select(
      "id,date,completed_at,route_stops(id,stop_order,status,arrived_at,completed_at,dropoff_confirmed,pickup_confirmed,notes,piece_count,customers(id,name,address,lat,lng),stop_photos(storage_path)),driver_locations(lat,lng,created_at)"
    )
    .eq("status", "completed")
    .order("date", { ascending: false })
    .order("stop_order", { referencedTable: "route_stops" })
    .order("created_at", { referencedTable: "driver_locations" })
    .limit(40);

  const photoUrl = (p: string) =>
    supabase.storage.from("stop-photos").getPublicUrl(p).data.publicUrl;

  // Prospect visits attached to these routes (tolerant of the table being
  // absent). Grouped by route so we can fold them into each route's timeline.
  const routeIds = ((data ?? []) as unknown as RawRoute[]).map((r) => r.id);
  const pvByRoute: Record<string, RawProspectVisit[]> = {};
  if (routeIds.length) {
    const { data: pvs } = await supabase
      .from("route_prospect_visits")
      .select("id, route_id, status, notes, visited_at, prospects(id, name, address)")
      .in("route_id", routeIds);
    for (const pv of (pvs ?? []) as unknown as RawProspectVisit[]) {
      (pvByRoute[pv.route_id] ??= []).push(pv);
    }
  }

  const routes: HistoryRoute[] = ((data ?? []) as unknown as RawRoute[]).map((r) => {
    const deliveryStops: HistoryRoute["stops"] = (r.route_stops ?? []).map((s) => ({
      id: s.id,
      kind: "delivery" as const,
      customerId: s.customers?.id ?? null,
      order: s.stop_order,
      name: s.customers?.name ?? "Unknown",
      address: s.customers?.address ?? "",
      lat: s.customers?.lat ?? null,
      lng: s.customers?.lng ?? null,
      status: s.status,
      arrivedAt: s.arrived_at,
      completedAt: s.completed_at,
      dropoff: s.dropoff_confirmed,
      pickup: s.pickup_confirmed,
      notes: s.notes,
      pieces: s.piece_count ?? 0,
      photos: (s.stop_photos ?? []).map((p) => photoUrl(p.storage_path)),
    }));

    const prospectStops: HistoryRoute["stops"] = (pvByRoute[r.id] ?? []).map((pv) => ({
      id: `pv-${pv.id}`,
      kind: "prospect" as const,
      prospectId: pv.prospects?.id ?? null,
      order: 0,
      name: pv.prospects?.name ?? "Prospect",
      address: pv.prospects?.address ?? "",
      lat: null,
      lng: null,
      status: pv.status === "visited" ? "completed" : pv.status,
      arrivedAt: null,
      completedAt: pv.visited_at,
      dropoff: false,
      pickup: false,
      notes: pv.notes,
      pieces: 0,
      photos: [],
    }));

    // Merge and order by when each was actually done so the numbered timeline
    // reflects the real run; anything without a timestamp sinks to the end.
    const merged = [...deliveryStops, ...prospectStops].sort((a, b) => {
      const at = a.completedAt ?? a.arrivedAt ?? "";
      const bt = b.completedAt ?? b.arrivedAt ?? "";
      if (!at) return 1;
      if (!bt) return -1;
      return at.localeCompare(bt);
    });

    return {
    id: r.id,
    date: r.date,
    completedAt: r.completed_at,
    stops: merged,
    // Keep GPS pings within the East End service area so a stray reading can't
    // blow out the map bounds.
    path: (r.driver_locations ?? [])
      .filter((d) => d.lat != null && d.lng != null && d.lat > 40.4 && d.lat < 41.4 && d.lng > -74 && d.lng < -71.5)
      .map((d) => ({ lng: d.lng, lat: d.lat })),
    };
  });

  return <HistoryView routes={routes} />;
}
