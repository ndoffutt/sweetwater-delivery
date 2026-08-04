import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import OpsShell from "@/components/ops/OpsShell";
import { getOverdueProspectCount, getThreadTable, getActionItems, currentWeekStart } from "@/lib/opsData";

export const dynamic = "force-dynamic";

// The Ops Hub is the OWNER'S console. The manager keeps the existing MgrShell
// experience at /dispatch and the driver keeps /driver — both untouched. Any
// non-admin landing here is sent back to their own home.
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");
  if (session.role !== "admin") redirect("/dispatch");

  const supabase = createAdminClient();
  const week = currentWeekStart();
  const [threads, prospects, items] = await Promise.all([
    getThreadTable(supabase),
    getOverdueProspectCount(supabase),
    getActionItems(supabase, week),
  ]);

  return (
    <OpsShell
      userName={session.name}
      initialCounts={{
        messages: threads.filter((t) => t.waitingSince && !t.archived).length,
        reports: items.filter((i) => !i.completed_week).length,
        prospects,
      }}
    >
      {children}
    </OpsShell>
  );
}
