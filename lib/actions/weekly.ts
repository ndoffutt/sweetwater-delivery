"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

export interface ActionItemRow {
  id: string;
  owner: string;
  owner_id: string | null;
  action: string;
  section: "operations" | "growth";
  opened_week: string;
  completed_week: string | null;
}

export interface WeeklyUpdateRow {
  id?: string;
  week_start: string;
  sweetwater_revenue: number | null;
  jrs_revenue: number | null;
  delivery_revenue: number | null;
  sweetwater_ytd: number | null;
  jrs_ytd: number | null;
  delivery_ytd: number | null;
  sweetwater_ytd_prior: number | null;
  jrs_ytd_prior: number | null;
  delivery_ytd_prior: number | null;
  staffing_status: string | null;
  staffing_note: string | null;
  equipment_status: string | null;
  equipment_note: string | null;
  blocking_growth: string | null;
  key_updates: string | null;
  expectation_note: string | null;
  submitted_at?: string | null;
}

// Tables land by migration; until then every call degrades to "nothing yet"
// rather than breaking the page (same tolerance used elsewhere in this app).
const missing = (m?: string) => !!m && /(does not exist|schema cache|could not find)/i.test(m);

export async function saveWeeklyUpdate(row: WeeklyUpdateRow) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("weekly_updates")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "week_start" });
  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/dispatch/weekly");
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
}

/** Manager writes these in each week; an unresolved one carries forward. */
export async function addCustomerIssue(input: {
  description: string;
  customerName?: string | null;
  openedWeek: string;
}) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_issues").insert({
    description: input.description.trim(),
    customer_name: input.customerName?.trim() || null,
    opened_week: input.openedWeek,
    created_by: session.name,
  });
  if (error) return { error: missing(error.message) ? "Run supabase/customer_issues.sql first." : error.message };
  revalidatePath("/reports");
  revalidatePath("/dispatch/weekly");
  return { success: true };
}

/** Resolve (or reopen). resolved_week records WHICH week it was closed in, so
 *  a past update still shows what got closed during it. */
export async function setCustomerIssueResolved(id: string, weekStart: string, resolved: boolean) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customer_issues")
    .update(
      resolved
        ? { resolved_week: weekStart, resolved_at: new Date().toISOString() }
        : { resolved_week: null, resolved_at: null }
    )
    .eq("id", id);
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
  // owner_id lands with ops_hub.sql — try it, fall back to the core insert on
  // a database that hasn't run that migration yet.
  let { error } = await supabase.from("action_items").insert({ ...base, owner_id: input.ownerId ?? null });
  if (error && /owner_id/i.test(error.message)) {
    ({ error } = await supabase.from("action_items").insert(base));
  }
  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/dispatch/weekly");
  revalidatePath("/today");
  revalidatePath("/reports");
  return { success: true };
}

/** Mark done (or reopen). Completed items show "(Completed)" for the week they
 *  finished, then drop out of the following week's update. */
export async function setActionItemDone(id: string, weekStart: string, done: boolean) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("action_items")
    .update(
      done
        ? { completed_week: weekStart, completed_at: new Date().toISOString() }
        : { completed_week: null, completed_at: null }
    )
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dispatch/weekly");
  revalidatePath("/today");
  revalidatePath("/reports");
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
