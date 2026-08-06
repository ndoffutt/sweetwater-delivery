import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import OpsShell from "@/components/ops/OpsShell";
import { getOverdueProspectCount, getThreadTable, getActionItems, currentWeekStart } from "@/lib/opsData";

export const dynamic = "force-dynamic";

// The Ops Hub — the owner's console, and now Ahsin's (dispatcher) too, full
// parity except Revenue (blocked in middleware). The driver keeps /driver,
// untouched.
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");
  if (session.role !== "admin" && session.role !== "dispatcher") redirect("/dispatch");

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
