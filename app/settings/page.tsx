import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import SettingsPanel, { type TeamMember, type DeletionEntry } from "@/components/SettingsPanel";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");
  // Settings is owner-only for now — keep the manager out, even by direct URL.
  if (session.role === "dispatcher") redirect("/dispatch");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, role, phone, active, created_at")
    .is("deleted_at", null)
    .order("role")
    .order("created_at");

  // Recently Deleted — most recent 50 soft-deletes across every audited
  // table. Tolerant of the deletion_audit table not yet existing on an
  // un-migrated environment.
  let deletions: DeletionEntry[] = [];
  try {
    const { data: dels } = await supabase
      .from("deletion_audit")
      .select("id, table_name, row_id, before_state, deleted_by, deleted_by_name, deleted_at")
      .order("deleted_at", { ascending: false })
      .limit(50);
    deletions = (dels ?? []) as DeletionEntry[];
  } catch { /* deletion_audit migration pending */ }

  return (
    <SettingsPanel
      meId={session.id}
      viewerRole={session.role as "admin" | "dispatcher"}
      team={(data ?? []) as TeamMember[]}
      deletions={deletions}
    />
  );
}
