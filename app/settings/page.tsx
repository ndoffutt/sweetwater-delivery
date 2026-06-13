import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import SettingsPanel, { type TeamMember } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") {
    redirect(session.role === "driver" ? "/driver" : "/dispatch");
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, role, phone, active, created_at")
    .is("deleted_at", null)
    .order("role")
    .order("created_at");

  return <SettingsPanel meId={session.id} team={(data ?? []) as TeamMember[]} />;
}
