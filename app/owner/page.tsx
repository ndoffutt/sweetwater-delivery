import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOverdueForVisit } from "@/lib/prospectVisit";
import { getRecentActivity } from "@/lib/activity";
import OwnerHome from "@/components/OwnerHome";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");

  // Visit-reminder badge on the Sales card (tolerant of missing prospects tables).
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prospects")
    .select("status, created_at, touchpoints:prospect_touchpoints(type, created_at)")
    .is("deleted_at", null)
    .in("status", ["new", "working", "active"]);
  const overdueCount = ((data ?? []) as unknown as Prospect[]).filter(isOverdueForVisit).length;

  const activity = await getRecentActivity(20);

  return <OwnerHome name={session.name} overdueCount={overdueCount} activity={activity} />;
}
