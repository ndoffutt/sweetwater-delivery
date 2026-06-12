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

  const stops = (route.route_stops || []) as RouteStop[];

  return <DriverMap initialStops={stops} isManager={isManager} />;
}
