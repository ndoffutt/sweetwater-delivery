import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternToday } from "@/lib/date";
import { cheapestInsertion } from "@/lib/geo";
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

  const { data: route } = await supabase
    .from("routes")
    .select(`*, route_stops(*, customer:customers(*), photos:stop_photos(*))`)
    .eq("date", today)
    .in("status", ["dispatched", "in_progress"])
    .order("stop_order", { referencedTable: "route_stops" })
    .single();

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

  const baseStops = (route.route_stops || []) as RouteStop[];

  // Planned prospect visits attached to this route — rendered as stops in the
  // driver flow so the manager can log them in-the-moment. Best-effort: if the
  // route_prospect_visits table isn't present, just skip.
  let prospectStops: RouteStop[] = [];
  try {
    const { data: pv } = await supabase
      .from("route_prospect_visits")
      .select(
        "id, prospect_id, status, notes, created_at, prospects(id, name, address, phone, lat, lng, notes, touchpoints:prospect_touchpoints(id, type, note, created_by, created_at))"
      )
      .eq("route_id", route.id);

    type Row = {
      id: string; prospect_id: string; status: string; notes: string | null; created_at: string;
      prospects: {
        id: string; name: string; address: string | null; phone: string | null;
        lat: number | null; lng: number | null; notes: string | null;
        touchpoints: { id: string; type: string; note: string | null; created_by: string | null; created_at: string }[] | null;
      } | null;
    };

    // stop_order is assigned later, after we interleave them with deliveries
    // by geography. Keep a placeholder of 0 for now.
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
          stop_order: 0,
          status: r.status === "visited" ? "completed" : "pending",
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

  // Interleave prospect visits geographically into the delivery sequence using
  // cheapest-insertion: each prospect gets dropped between the two delivery
  // stops where it adds the least detour. Prospects without coords get
  // appended at the end (no way to position them). Final pass renumbers
  // everything 1..N so the driver sees a single, ordered sequence.
  const ordered: RouteStop[] = [...baseStops].sort((a, b) => a.stop_order - b.stop_order);
  for (const pv of prospectStops) {
    const lat = pv.customer?.lat;
    const lng = pv.customer?.lng;
    if (lat == null || lng == null) {
      ordered.push(pv);
      continue;
    }
    const positioned = ordered
      .map((s, i) => ({ s, i, lat: s.customer?.lat, lng: s.customer?.lng }))
      .filter((x) => x.lat != null && x.lng != null) as { s: RouteStop; i: number; lat: number; lng: number }[];
    if (positioned.length === 0) { ordered.push(pv); continue; }
    const idxInPositioned = cheapestInsertion(
      positioned.map((x) => ({ lat: x.lat, lng: x.lng })),
      { lat, lng }
    );
    // Translate the index from "positioned-only" space back to the full ordered array.
    const insertAt =
      idxInPositioned >= positioned.length
        ? ordered.length
        : positioned[idxInPositioned].i;
    ordered.splice(insertAt, 0, pv);
  }
  const stops: RouteStop[] = ordered.map((s, i) => ({ ...s, stop_order: i + 1 }));

  return <DriverMap initialStops={stops} isManager={isManager} canMessage={session.role === "admin"} />;
}
