import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternToday } from "@/lib/date";
import Header from "@/components/Header";
import DriverMap from "@/components/DriverMap";
import type { RouteStop } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const isManager = session.role === "dispatcher";

  const supabase = createAdminClient();
  const today = easternToday();

  const { data: routes } = await supabase
    .from("routes")
    .select(`*, route_stops(*, customer:customers(*), photos:stop_photos(*))`)
    .eq("date", today)
    .in("status", ["dispatched", "in_progress", "completed"])
    .order("stop_order", { referencedTable: "route_stops" });

  // Prefer an active route; otherwise fall back to today's completed route so the
  // "Route Complete" screen persists for the whole day until the driver taps Done
  // (the dismissal itself is remembered client-side).
  const route =
    (routes ?? []).find((r) => r.status === "dispatched" || r.status === "in_progress") ??
    (routes ?? []).find((r) => r.status === "completed") ??
    null;

  if (!route) {
    return (
      <>
        <Header
          title="Sweetwater's"
          subtitle="Delivery"
          userName={session.name}
          backHref={isManager ? "/dispatch" : undefined}
        />
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-cream flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🚐</span>
            </div>
            <h2 className="font-serif text-2xl font-light text-charcoal mb-2">
              No Route Today
            </h2>
            <p className="font-body text-sm text-charcoal/50">
              Check back once dispatch sends your route.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Drop soft-deleted stops — the trigger has already captured them in
  // deletion_audit for the Settings → Recently Deleted view.
  const baseStops = ((route.route_stops || []) as RouteStop[])
    .filter((s) => !(s as RouteStop & { deleted_at?: string | null }).deleted_at);

  // Planned prospect visits attached to this route — rendered as stops in the
  // driver flow so the manager can log them in-the-moment. Best-effort: if the
  // route_prospect_visits table isn't present, just skip.
  let prospectStops: RouteStop[] = [];
  try {
    const { data: pv } = await supabase
      .from("route_prospect_visits")
      .select(
        "id, prospect_id, status, notes, created_at, stop_order, prospects(id, name, address, phone, lat, lng, notes, touchpoints:prospect_touchpoints(id, type, note, created_by, created_at))"
      )
      .eq("route_id", route.id)
      .is("deleted_at", null);

    type Row = {
      id: string; prospect_id: string; status: string; notes: string | null; created_at: string;
      prospects: {
        id: string; name: string; address: string | null; phone: string | null;
        lat: number | null; lng: number | null; notes: string | null;
        touchpoints: { id: string; type: string; note: string | null; created_by: string | null; created_at: string }[] | null;
      } | null;
    };

    // stop_order is now persisted on each visit (assigned at insert time via
    // cheapest-insertion in addProspectVisit / addProspectToTodaysRoute), so
    // we just read it through. Falls back to 0 for rows from before the
    // migration ran; those land at the head until you reassign.
    prospectStops = ((pv ?? []) as unknown as Row[])
      .filter((r) => r.prospects)
      .map((r) => {
        const p = r.prospects!;
        // Newest visit/delivery sets "last visit"; full history is shown to driver.
        const history = (p.touchpoints ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
        const lastVisit = history.find((t) => t.type === "visit" || t.type === "delivery") ?? null;
        return {
          id: `pv-${r.id}`,
          route_id: route.id,
          customer_id: p.id, // unused, kept non-null for the type
          stop_order: (r as unknown as { stop_order: number | null }).stop_order ?? 0,
          status: r.status === "visited" ? "completed" : r.status === "skipped" ? "skipped" : "pending",
          has_dropoff: false,
          has_pickup: false,
          dropoff_confirmed: false,
          pickup_confirmed: false,
          notes: r.notes,
          arrived_at: null,
          completed_at: r.status === "visited" ? r.created_at : null,
          created_at: r.created_at,
          // Reuse the Customer shape so RouteMap can pin this stop on the map.
          customer: {
            id: p.id, name: p.name, address: p.address ?? "", phone: p.phone,
            lat: p.lat, lng: p.lng,
            gate_code: null, delivery_notes: null, tags: null,
            spot_account: null, account_type: null, route_seq: null,
            active: true, created_at: r.created_at,
          } as unknown as RouteStop["customer"],
          photos: [],
          kind: "prospect_visit",
          prospect_visit: {
            id: r.id,
            prospect_id: p.id,
            name: p.name,
            address: p.address,
            phone: p.phone,
            notes_summary: p.notes,
            last_visit_at: lastVisit?.created_at ?? null,
            history,
          },
        } as RouteStop;
      });
  } catch {
    /* route_prospect_visits table not present — driver flow continues unchanged */
  }

  // Sort prospect visits + delivery stops by the persisted stop_order.
  // Cheapest-insertion now runs at insert time on the server
  // (lib/actions/prospectVisits.ts → pickStopOrderAndBump), so the sequence
  // here is stable across reloads and reflects any dispatcher reorder.
  // Display indexes are renumbered 1..N below so gaps from a deletion still
  // look clean to the driver.
  const merged: RouteStop[] = [...baseStops, ...prospectStops].sort(
    (a, b) => a.stop_order - b.stop_order
  );
  const stops: RouteStop[] = merged.map((s, i) => ({ ...s, stop_order: i + 1 }));

  return <DriverMap initialStops={stops} isManager={isManager} canMessage={session.role === "admin"} routeId={route.id} />;
}
