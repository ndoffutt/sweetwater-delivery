import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import TeamPanel, { type TeamMember, type DeletionEntry } from "@/components/ops/TeamPanel";

export const dynamic = "force-dynamic";

// Team & settings — owner-only, in the ops shell.
export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dispatch");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, role, phone, active, created_at")
    .is("deleted_at", null)
    .order("role")
    .order("created_at");

  // Most recent 50 soft-deletes across every audited table. Tolerant of the
  // deletion_audit table not yet existing on an un-migrated environment.
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
    <TeamPanel
      meId={session.id}
      viewerRole="admin"
      team={(data ?? []) as TeamMember[]}
      deletions={deletions}
    />
  );
}
