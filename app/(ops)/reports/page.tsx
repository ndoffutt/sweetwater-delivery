import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { getOpenExceptions, getResolvedExceptions } from "@/lib/actions/exceptions";
import { getActionItems, getWeeklyRow, currentWeekStart } from "@/lib/opsData";
import type { ReportCommentRow } from "@/lib/actions/weekly";
import ReportsHub, { type ReportsData } from "@/components/ops/ReportsHub";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  const session = await getSession();
  const supabase = createAdminClient();
  const thisWeek = currentWeekStart();
  // ?week=YYYY-MM-DD opens a past update read/edit; anything else is ignored.
  const requested = searchParams?.week;
  const week =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= thisWeek
      ? requested
      : thisWeek;
  const weekStartMs = new Date(week + "T00:00:00").getTime();

  const [weekly, items, open, resolved] = await Promise.all([
    getWeeklyRow(supabase, week),
    getActionItems(supabase, week),
    getOpenExceptions(60).catch(() => []),
    getResolvedExceptions(60).catch(() => []),
  ]);

  // Auto-filled customer-issue counts, same derivation as the old weekly page.
  const inWeek = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= weekStartMs;
  const issues = {
    open: open.length,
    newThisWeek: open.filter((e) => inWeek(e.date)).length,
    resolved: resolved.filter((e) => inWeek((e as unknown as { resolvedAt?: string }).resolvedAt ?? e.date)).length,
  };

  // Sales engine counts.
  let activeOpportunities = 0;
  let touchpointsThisWeek = 0;
  try {
    const { data } = await supabase.from("prospects").select("status").is("deleted_at", null);
    activeOpportunities = ((data ?? []) as { status: string }[]).filter((p) => p.status === "working" || p.status === "active").length;
  } catch { /* zeros */ }
  try {
    const { data } = await supabase
      .from("prospect_touchpoints")
      .select("created_at")
      .gte("created_at", new Date(weekStartMs).toISOString());
    touchpointsThisWeek = (data ?? []).length;
  } catch { /* zeros */ }

  // Section comments + past updates — both tolerate missing tables.
  let comments: ReportCommentRow[] = [];
  try {
    const { data, error } = await supabase
      .from("report_comments")
      .select("*")
      .eq("week_start", week)
      .order("created_at", { ascending: true });
    if (!error) comments = (data ?? []) as ReportCommentRow[];
  } catch { /* none */ }

  let pastUpdates: { week_start: string; submitted_at: string | null }[] = [];
  try {
    const { data, error } = await supabase
      .from("weekly_updates")
      .select("week_start, submitted_at")
      .lt("week_start", thisWeek)
      .neq("week_start", week)
      .order("week_start", { ascending: false })
      .limit(30);
    if (!error) pastUpdates = (data ?? []) as typeof pastUpdates;
  } catch { /* none */ }

  const data: ReportsData = {
    weekStart: week,
    currentWeekStart: thisWeek,
    userName: session?.name ?? "",
    weekly,
    items,
    issues,
    activeOpportunities,
    touchpointsThisWeek,
    comments,
    pastUpdates,
  };

  return <ReportsHub data={data} />;
}
