import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { getOpenExceptions, getResolvedExceptions } from "@/lib/actions/exceptions";
import { getActionItems, getTeamMembers, getWeeklyRow, getCustomerIssues, getEntityComments, getWeekTouchpoints, getRetentionCustomers, currentWeekStart } from "@/lib/opsData";
import type { ReportCommentRow } from "@/lib/actions/weekly";
import ReportsHub, { type ReportsData } from "@/components/ops/ReportsHub";
import PrintedUpdate from "@/components/ops/PrintedUpdate";
import weeklyHistory from "@/lib/weeklyHistoryData.json";

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

  // Pre-app weeks render as the printed copy of the original email, not the
  // editable form.
  const role = session?.role === "dispatcher" ? "dispatcher" : "admin";

  const printed = (weeklyHistory as Record<string, { date: string; text: string }>)[week];
  if (printed && week !== thisWeek) {
    return <PrintedUpdate date={printed.date} text={printed.text} role={role} />;
  }

  const weekStartMs = new Date(week + "T00:00:00").getTime();

  const [weekly, items, team, open, resolved] = await Promise.all([
    getWeeklyRow(supabase, week),
    getActionItems(supabase, week),
    getTeamMembers(supabase),
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

  const customerIssues = await getCustomerIssues(supabase, week);
  // For the Customer Issues picker — a real account, not a typed name that
  // might not match anything.
  let customers: { id: string; name: string }[] = [];
  try {
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");
    customers = (data ?? []) as { id: string; name: string }[];
  } catch { /* customers table always exists, but stay tolerant */ }
  const weekTouchpoints = await getWeekTouchpoints(supabase, week);
  const retention = await getRetentionCustomers(supabase);
  const [issueComments, itemComments, retentionComments] = await Promise.all([
    getEntityComments(supabase, "customer_issue", customerIssues.map((i) => i.id)),
    getEntityComments(supabase, "action_item", items.map((i) => i.id)),
    getEntityComments(supabase, "retention", retention.map((r) => r.id)),
  ]);

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

  // `weekly_updates` holds two different things since the revenue history was
  // imported: weeks somebody actually wrote up, and weeks that exist only
  // because they carry figures. Labelling the latter "Never submitted" reads
  // as a missed deadline when in truth nothing was ever started, so the list
  // has to be able to tell them apart.
  let pastUpdates: { week_start: string; submitted_at: string | null; written: boolean }[] = [];
  try {
    const { data, error } = await supabase
      .from("weekly_updates")
      .select("week_start, submitted_at, staffing_note, equipment_note, key_updates, blocking_growth, expectation_note")
      .lt("week_start", thisWeek)
      .neq("week_start", week)
      .order("week_start", { ascending: false })
      .limit(30);
    if (!error) {
      pastUpdates = ((data ?? []) as Record<string, string | null>[]).map((w) => ({
        week_start: w.week_start as string,
        submitted_at: w.submitted_at ?? null,
        written: ["staffing_note", "equipment_note", "key_updates", "blocking_growth", "expectation_note"]
          .some((k) => (w[k] ?? "").trim().length > 0),
      }));
    }
  } catch { /* none */ }

  const data: ReportsData = {
    weekStart: week,
    currentWeekStart: thisWeek,
    userName: session?.name ?? "",
    weekly,
    items,
    team,
    issues,
    customerIssues,
    issueComments,
    itemComments,
    activeOpportunities,
    touchpointsThisWeek,
    weekTouchpoints,
    retention,
    retentionComments,
    comments,
    pastUpdates,
    role,
    customers,
  };

  // Keyed on the viewed week: ReportsHub's form fields are local useState
  // seeded from `data` only at mount, so switching weeks via ?week= without
  // a remount would leave stale fields from the old week sitting in the new
  // week's form. Autosave makes that a real risk (a stray keystroke would
  // silently write the wrong week) where manual Save previously needed a
  // deliberate click to trigger it.
  return <ReportsHub key={week} data={data} />;
}
