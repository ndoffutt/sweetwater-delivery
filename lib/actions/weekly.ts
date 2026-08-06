"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

export interface ActionItemRow {
  id: string;
  owner: string;
  owner_id: string | null;
  critical: boolean;
  action: string;
  section: "operations" | "growth";
  opened_week: string;
  completed_week: string | null;
  resolution: string | null;
}

export interface WeeklyUpdateRow {
  id?: string;
  week_start: string;
  // Revenue is optional here and never written by saveWeeklyUpdate — the
  // Revenue page owns those columns. Kept on the type only so older callers
  // still type-check.
  sweetwater_revenue?: number | null;
  jrs_revenue?: number | null;
  delivery_revenue?: number | null;
  sweetwater_ytd?: number | null;
  jrs_ytd?: number | null;
  delivery_ytd?: number | null;
  sweetwater_ytd_prior?: number | null;
  jrs_ytd_prior?: number | null;
  delivery_ytd_prior?: number | null;
  staffing_status: string | null;
  staffing_note: string | null;
  equipment_status: string | null;
  equipment_note: string | null;
  key_updates: string | null;
  submitted_at?: string | null;
}

// Tables land by migration; until then every call degrades to "nothing yet"
// rather than breaking the page (same tolerance used elsewhere in this app).
const missing = (m?: string) => !!m && /(does not exist|schema cache|could not find)/i.test(m);

/** The written update: statuses and text. Deliberately does NOT touch the
 *  revenue columns — those belong to the Revenue page now.
 *
 *  It used to upsert the whole row, including eight revenue figures the
 *  weekly-update screen no longer even shows. A tab opened before the figures
 *  were entered still held the old (usually empty) values, so clicking "Save
 *  draft" hours later wrote them back over whatever had since been saved. The
 *  Revenue page was already guarded against the mirror of this; this is the
 *  other direction. */
export async function saveWeeklyUpdate(row: WeeklyUpdateRow) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const patch = {
    staffing_status: row.staffing_status,
    staffing_note: row.staffing_note,
    equipment_status: row.equipment_status,
    equipment_note: row.equipment_note,
    key_updates: row.key_updates,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("weekly_updates")
    .select("id")
    .eq("week_start", row.week_start)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("weekly_updates").update(patch).eq("week_start", row.week_start)
    : await supabase.from("weekly_updates").insert({ week_start: row.week_start, ...patch });

  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/dispatch/weekly");
  revalidatePath("/reports");
  return { success: true };
}

/** Revenue only. Deliberately NOT saveWeeklyUpdate: that upserts the whole
 *  row, so saving figures from the Revenue page would blank the manager's
 *  staffing, equipment and key-updates text for that week. */
export async function saveWeeklyRevenue(row: {
  week_start: string;
  sweetwater_revenue: number | null;
  sweetwater_ytd: number | null;
  sweetwater_ytd_prior: number | null;
  jrs_revenue: number | null;
  jrs_ytd: number | null;
  jrs_ytd_prior: number | null;
  delivery_revenue: number | null;
  delivery_ytd: number | null;
}) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { week_start, ...figures } = row;
  const patch = { ...figures, updated_at: new Date().toISOString() };

  // Update in place when the week already exists; insert only if it doesn't.
  const { data: existing } = await supabase
    .from("weekly_updates")
    .select("id")
    .eq("week_start", week_start)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("weekly_updates").update(patch).eq("week_start", week_start)
    : await supabase.from("weekly_updates").insert({ week_start, ...patch });

  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/reports");
  revalidatePath("/reports/revenue");
  return { success: true };
}

export async function submitWeeklyUpdate(weekStart: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("weekly_updates")
    .update({ submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("week_start", weekStart);
  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/reports");
  revalidatePath("/dispatch/weekly");
  return { success: true };
}

export interface ReportCommentRow {
  id: string;
  week_start: string;
  section: string; // 'issues' | 'operations' | 'growth'
  author: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
}

/** Comments attach to a section of the weekly update — the owner↔manager
 *  back-and-forth that used to happen over text, kept next to the numbers. */
export async function addReportComment(weekStart: string, section: string, body: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("report_comments").insert({
    week_start: weekStart,
    section,
    author: session.name,
    body: body.trim(),
  });
  if (error) return { error: missing(error.message) ? "Run supabase/ops_hub.sql first." : error.message };
  revalidatePath("/reports");
  return { success: true };
}

export async function resolveReportComment(id: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("report_comments")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/reports");
  return { success: true };
}

export interface CustomerIssueRow {
  id: string;
  description: string;
  customer_name: string | null;
  opened_week: string;
  resolved_week: string | null;
  resolution: string | null;
}

/** Manager writes these in each week; an unresolved one carries forward.
 *  customerName must be a real account (the UI only offers a picker built
 *  from the customers table) — an issue with nobody attached to it isn't
 *  traceable to anything later. */
export async function addCustomerIssue(input: {
  description: string;
  customerName: string;
  openedWeek: string;
}) {
  const name = input.customerName.trim();
  if (!name) return { error: "Pick a customer" };
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  // Return the inserted row: the caller needs the REAL id. Rendering an
  // optimistic row under a made-up "tmp-…" id meant resolving or deleting it
  // before the next refresh sent that string to Postgres and blew up on the
  // uuid cast — on exactly the add-then-resolve path this section is for.
  const { data, error } = await supabase
    .from("customer_issues")
    .insert({
      description: input.description.trim(),
      customer_name: name,
      opened_week: input.openedWeek,
      created_by: session.name,
    })
    .select("id, description, customer_name, opened_week, resolved_week, resolution")
    .single();
  if (error) return { error: missing(error.message) ? "Run supabase/customer_issues.sql first." : error.message };
  revalidatePath("/reports");
  revalidatePath("/dispatch/weekly");
  return { issue: data as CustomerIssueRow };
}

/** Resolve (or reopen). resolved_week records WHICH week it was closed in, so
 *  a past update still shows what got closed during it. */
export async function setCustomerIssueResolved(
  id: string,
  weekStart: string,
  resolved: boolean,
  resolution?: string
) {
  await requireSession("dispatcher");
  // Closing an issue requires saying how. "Resolved" alone is a checkbox, not
  // an answer, and it's the repeat offenders where the how matters most.
  const why = (resolution ?? "").trim();
  if (resolved && !why) return { error: "Say how it was resolved." };
  const supabase = createAdminClient();
  const done = { resolved_week: weekStart, resolved_at: new Date().toISOString(), resolution: why };
  const undone = { resolved_week: null, resolved_at: null, resolution: null };
  let { error } = await supabase.from("customer_issues").update(resolved ? done : undone).eq("id", id);
  if (error && /resolution/i.test(error.message)) {
    // Pre-migration: still record the state change rather than losing it.
    const { resolution: _drop, ...bare } = resolved ? done : undone;
    void _drop;
    ({ error } = await supabase.from("customer_issues").update(bare).eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/reports");
  revalidatePath("/dispatch/weekly");
  return { success: true };
}

export async function removeCustomerIssue(id: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  let { error } = await supabase
    .from("customer_issues")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.id })
    .eq("id", id);
  if (error && missing(error.message)) {
    ({ error } = await supabase.from("customer_issues").delete().eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/reports");
  revalidatePath("/dispatch/weekly");
  return { success: true };
}

export async function addActionItem(input: {
  owner: string;
  ownerId?: string | null;
  action: string;
  section: "operations" | "growth";
  openedWeek: string;
  critical?: boolean;
}) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const base = {
    owner: input.owner.trim(),
    action: input.action.trim(),
    section: input.section,
    opened_week: input.openedWeek,
    created_by: session.name,
  };
  // owner_id and critical each land with their own migration — step the
  // fallback so a database missing one doesn't lose the other.
  const withOwner = { ...base, owner_id: input.ownerId ?? null };
  const COLS = "id, owner, owner_id, action, section, opened_week, completed_week, critical";
  const ins = (row: Record<string, unknown>, cols: string) =>
    supabase.from("action_items").insert(row).select(cols).single();

  // Same reason as customer issues: the caller needs the real id so a
  // just-added item can be completed or flagged without a refresh first.
  let { data, error } = await ins({ ...withOwner, critical: !!input.critical }, COLS);
  if (error && /critical/i.test(error.message)) {
    ({ data, error } = await ins(withOwner, "id, owner, owner_id, action, section, opened_week, completed_week"));
  }
  if (error && /owner_id/i.test(error.message)) {
    ({ data, error } = await ins(base, "id, owner, action, section, opened_week, completed_week"));
  }
  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/dispatch/weekly");
  revalidatePath("/today");
  revalidatePath("/reports");
  const row = data as unknown as Partial<ActionItemRow>;
  return {
    item: {
      ...row,
      owner_id: row.owner_id ?? null,
      critical: row.critical ?? false,
      resolution: row.resolution ?? null,
    } as ActionItemRow,
  };
}

/** Mark done (or reopen). Completed items show "(Completed)" for the week they
 *  finished, then drop out of the following week's update. */
/** Complete (or reopen). Same rule as customer issues: completing requires
 *  saying what happened — a checked box on its own doesn't say whether the
 *  fix stuck. Reopening needs no reason. */
export async function setActionItemDone(id: string, weekStart: string, done: boolean, resolution?: string) {
  await requireSession("dispatcher");
  const why = (resolution ?? "").trim();
  if (done && !why) return { error: "Say how it was resolved." };
  const supabase = createAdminClient();
  const completedPatch = { completed_week: weekStart, completed_at: new Date().toISOString(), resolution: why };
  const reopenedPatch = { completed_week: null, completed_at: null, resolution: null };
  let { error } = await supabase
    .from("action_items")
    .update(done ? completedPatch : reopenedPatch)
    .eq("id", id);
  if (error && /resolution/i.test(error.message)) {
    // Pre-migration: still record the state change rather than losing it.
    const { resolution: _drop, ...bare } = done ? completedPatch : reopenedPatch;
    void _drop;
    ({ error } = await supabase.from("action_items").update(bare).eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/dispatch/weekly");
  revalidatePath("/today");
  revalidatePath("/reports");
  return { success: true };
}

/** Flag/unflag an item as critical. */
export async function setActionItemCritical(id: string, critical: boolean) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("action_items").update({ critical }).eq("id", id);
  if (error) return { error: /critical/i.test(error.message) ? "Run supabase/action_item_critical.sql first." : error.message };
  revalidatePath("/reports");
  revalidatePath("/today");
  return { success: true };
}

export async function removeActionItem(id: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  let { error } = await supabase
    .from("action_items")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.id })
    .eq("id", id);
  if (error && missing(error.message)) {
    ({ error } = await supabase.from("action_items").delete().eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/dispatch/weekly");
  return { success: true };
}
