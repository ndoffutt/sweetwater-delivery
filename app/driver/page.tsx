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

    const startSeq = (baseStops[baseStops.length - 1]?.stop_order ?? 0);
    prospectStops = ((pv ?? []) as unknown as Row[])
      .filter((r) => r.prospects)
      .map((r, i) => {
        const p = r.prospects!;
        // Newest visit/delivery sets "last visit"; full history is shown to driver.
        const history = (p.touchpoints ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
        const lastVisit = history.find((t) => t.type === "visit" || t.type === "delivery") ?? null;
        return {
          id: `pv-${r.id}`,
          route_id: route.id,
          customer_id: p.id, // unused, kept non-null for the type
          stop_order: startSeq + i + 1,
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

  const stops: RouteStop[] = [...baseStops, ...prospectStops];

  return <DriverMap initialStops={stops} isManager={isManager} canMessage={session.role === "admin"} />;
}
