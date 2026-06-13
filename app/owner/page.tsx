import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOverdueForVisit } from "@/lib/prospectVisit";
import OwnerHome from "@/components/OwnerHome";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") {
    redirect(session.role === "driver" ? "/driver" : "/dispatch");
  }

  // Visit-reminder badge on the Sales card. Tolerant of the prospects tables
  // not existing yet (count 0).
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prospects")
    .select("status, created_at, touchpoints:prospect_touchpoints(type, created_at)")
    .is("deleted_at", null)
    .in("status", ["new", "working", "active"]);
  const overdueCount = ((data ?? []) as unknown as Prospect[]).filter(isOverdueForVisit).length;

  return <OwnerHome name={session.name} overdueCount={overdueCount} />;
}
