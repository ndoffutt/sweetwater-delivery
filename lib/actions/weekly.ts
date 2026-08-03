"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

export interface ActionItemRow {
  id: string;
  owner: string;
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

export async function addActionItem(input: {
  owner: string;
  action: string;
  section: "operations" | "growth";
  openedWeek: string;
}) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("action_items").insert({
    owner: input.owner.trim(),
    action: input.action.trim(),
    section: input.section,
    opened_week: input.openedWeek,
    created_by: session.name,
  });
  if (error) return { error: missing(error.message) ? "Run supabase/weekly_updates.sql first." : error.message };
  revalidatePath("/dispatch/weekly");
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
