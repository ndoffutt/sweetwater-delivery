import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpenExceptions, getResolvedExceptions } from "@/lib/actions/exceptions";
import WeeklyUpdateView, { type WeeklyPageData } from "@/components/WeeklyUpdateView";
import type { ActionItemRow, WeeklyUpdateRow } from "@/lib/actions/weekly";

export const dynamic = "force-dynamic";

/** Monday-anchored week start for a date, as YYYY-MM-DD. */
function weekStartOf(d: Date): string {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(12, 0, 0, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export default async function WeeklyUpdatePage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");

  const supabase = createAdminClient();
  const now = new Date();
  const weekStart = weekStartOf(now);
  const weekStartMs = new Date(weekStart + "T00:00:00").getTime();

  // ── Section 1: customer issues, straight from the exception log ──
  const [open, resolved] = await Promise.all([
    getOpenExceptions(60).catch(() => []),
    getResolvedExceptions(60).catch(() => []),
  ]);
  const inThisWeek = (iso: string | null | undefined) =>
    !!iso && new Date(iso).getTime() >= weekStartMs;
  const openIssues = open.length;
  const newIssues = open.filter((e) => inThisWeek(e.date)).length;
  const resolvedIssues = resolved.filter((e) =>
    inThisWeek((e as unknown as { resolvedAt?: string }).resolvedAt ?? e.date)
  ).length;

  // ── Section 3: sales engine ──
  let activeOpportunities = 0;
  let touchpointsThisWeek = 0;
  try {
    const { data: pros } = await supabase
      .from("prospects")
      .select("status")
      .is("deleted_at", null);
    activeOpportunities = ((pros ?? []) as { status: string }[]).filter(
      (p) => p.status === "working" || p.status === "active"
    ).length;
  } catch { /* table missing: leave at 0 */ }
  try {
    const { data: tps } = await supabase
      .from("prospect_touchpoints")
      .select("created_at")
      .gte("created_at", new Date(weekStartMs).toISOString());
    touchpointsThisWeek = (tps ?? []).length;
  } catch { /* table missing: leave at 0 */ }

  // ── Saved state for this week + open action items ──
  let saved: WeeklyUpdateRow | null = null;
  let actionItems: ActionItemRow[] = [];
  let needsMigration = false;
  try {
    const { data, error } = await supabase
      .from("weekly_updates")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (error) needsMigration = true;
    else saved = (data as WeeklyUpdateRow) ?? null;
  } catch { needsMigration = true; }
  try {
    // Open items always carry over; completed ones show only in the week they
    // were completed, then drop out (format rule 5).
    const { data, error } = await supabase
      .from("action_items")
      .select("id,owner,action,section,opened_week,completed_week")
      .is("deleted_at", null)
      .or(`completed_week.is.null,completed_week.eq.${weekStart}`)
      .order("opened_week", { ascending: true });
    if (error) needsMigration = true;
    else actionItems = (data ?? []) as ActionItemRow[];
  } catch { needsMigration = true; }

  const data: WeeklyPageData = {
    weekStart,
    todayIso: now.toISOString(),
    openIssues,
    newIssues,
    resolvedIssues,
    activeOpportunities,
    touchpointsThisWeek,
    saved,
    actionItems,
    needsMigration,
  };

  return <WeeklyUpdateView data={data} />;
}
