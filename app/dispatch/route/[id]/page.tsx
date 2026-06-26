import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import RouteBuilder from "@/components/RouteBuilder";
import type { RouteStop } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RouteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();

  const { data: route } = await supabase
    .from("routes")
    .select(
      `*, route_stops(*, customer:customers(*), photos:stop_photos(*))`
    )
    .eq("id", params.id)
    .order("stop_order", { referencedTable: "route_stops" })
    .single();

  if (!route) notFound();

  // Pull planned prospect visits and merge into the same numbered sequence
  // as delivery stops, sorted by the persisted stop_order. Tolerant of the
  // stop_order column being missing on an unmigrated environment — those
  // visits just appear at the head (stop_order=0).
  let prospectStops: RouteStop[] = [];
  try {
    const { data: pv } = await supabase
      .from("route_prospect_visits")
      .select(
        "id, prospect_id, status, notes, created_at, stop_order, prospects(id, name, address, phone, lat, lng)"
      )
      .eq("route_id", route.id)
      .is("deleted_at", null);
    type Row = {
      id: string; prospect_id: string; status: string; notes: string | null;
      created_at: string; stop_order: number | null;
      prospects: { id: string; name: string; address: string | null; phone: string | null; lat: number | null; lng: number | null } | null;
    };
    prospectStops = ((pv ?? []) as unknown as Row[])
      .filter((r) => r.prospects)
      .map((r) => {
        const p = r.prospects!;
        return {
          id: `pv-${r.id}`,
          route_id: route.id,
          customer_id: p.id,
          stop_order: r.stop_order ?? 0,
          status: r.status === "visited" ? "completed" : "pending",
          has_dropoff: false,
          has_pickup: false,
          dropoff_confirmed: false,
          pickup_confirmed: false,
          notes: r.notes,
          arrived_at: null,
          completed_at: r.status === "visited" ? r.created_at : null,
          created_at: r.created_at,
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
            id: r.id, prospect_id: p.id, name: p.name, address: p.address,
            phone: p.phone, notes_summary: null, last_visit_at: null, history: [],
          },
        } as RouteStop;
      });
  } catch {
    /* route_prospect_visits absent — dispatcher view continues with deliveries only */
  }

  // Drop soft-deleted stops from the view. The trigger has already captured
  // them in deletion_audit (visible in Settings → Recently Deleted), so the
  // route list reflects what's actually still on the route.
  const liveDeliveryStops = ((route.route_stops ?? []) as RouteStop[])
    .filter((s) => !(s as RouteStop & { deleted_at?: string | null }).deleted_at);
  const liveProspectStops = prospectStops.filter(
    (s) => !(s as RouteStop & { deleted_at?: string | null }).deleted_at
  );
  const mergedStops: RouteStop[] = [
    ...liveDeliveryStops,
    ...liveProspectStops,
  ].sort((a, b) => a.stop_order - b.stop_order);

  const { data: customers } = await supabase
    .from("customers")
    .select("*")
    .eq("active", true)
    .is("deleted_at", null)
    .order("name");

  // Driver location
  let driverLocation = null;
  if (route.status === "in_progress") {
    const { data: loc } = await supabase
      .from("driver_locations")
      .select("lat, lng, accuracy, created_at")
      .eq("route_id", route.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    driverLocation = loc;
  }

  const dateStr = new Date(route.date + "T12:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric" }
  );

  return (
    <>
      <div className="p-4 md:max-w-3xl md:mx-auto">
        <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
          ← Dispatch
        </Link>
        <h2 className="font-serif text-2xl font-light text-charcoal">{dateStr}</h2>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-5">{route.status.replace("_", " ").toUpperCase()}</p>
        {/* Driver Location */}
        {driverLocation && (
          <div className="bg-green-primary/5 rounded-xl p-4 border border-green-primary/20 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-primary font-body uppercase tracking-widest mb-1">
                  Driver Location
                </p>
                <p className="text-xs text-charcoal/40 font-body">
                  Last ping:{" "}
                  {new Date(driverLocation.created_at).toLocaleTimeString()}
                  {driverLocation.accuracy &&
                    ` · ±${Math.round(driverLocation.accuracy)}m`}
                </p>
              </div>
              <a
                href={`https://maps.google.com/?q=${driverLocation.lat},${driverLocation.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-tap px-4 py-2 bg-green-primary text-cream text-xs font-body uppercase tracking-widest rounded-lg"
              >
                View Map
              </a>
            </div>
          </div>
        )}

        <RouteBuilder
          routeId={route.id}
          routeStatus={route.status}
          stops={mergedStops}
          customers={customers || []}
        />
      </div>
    </>
  );
}
