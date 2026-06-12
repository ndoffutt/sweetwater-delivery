import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import RouteBuilder from "@/components/RouteBuilder";

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
          stops={route.route_stops || []}
          customers={customers || []}
        />
      </div>
    </>
  );
}
