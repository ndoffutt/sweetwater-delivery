import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { easternToday } from "@/lib/date";
import LocationTracker from "@/components/LocationTracker";
import WelcomeBack from "@/components/WelcomeBack";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  // Drivers and dispatchers can both use driver mode - the manager sometimes
  // drives the route and switches over via the "Drive" button in dispatch.

  const supabase = createAdminClient();
  const today = easternToday();
  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("date", today)
    .in("status", ["dispatched", "in_progress"])
    .single();

  return (
    <div className="min-h-screen bg-cream-dark">
      <WelcomeBack name={session.name} />
      <div className="fixed top-2 left-3 z-50">
        <LocationTracker routeId={route?.id || null} />
      </div>
      {children}
    </div>
  );
}
