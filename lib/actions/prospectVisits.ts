"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

const missingTable = (msg: string | undefined) =>
  !!msg && /route_prospect_visits/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);

const NEEDS_MIGRATION = "Run supabase/route_prospect_visits.sql first";

// Attach an overdue prospect to today's route as a planned visit.
export async function addProspectVisit(routeId: string, prospectId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("route_prospect_visits")
    .upsert({ route_id: routeId, prospect_id: prospectId, status: "planned" }, { onConflict: "route_id,prospect_id" });
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { success: true };
}

export async function removeProspectVisit(routeId: string, prospectId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("route_prospect_visits")
    .delete()
    .eq("route_id", routeId)
    .eq("prospect_id", prospectId);
  if (error && !missingTable(error.message)) return { error: error.message };
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { success: true };
}

// Log the visit when the driver arrives: requires notes, marks it visited, and
// records a 'visit' touchpoint on the prospect (clears its overdue reminder).
export async function completeProspectVisit(id: string, prospectId: string, notes: string) {
  const session = await requireSession();
  const trimmed = notes?.trim();
  if (!trimmed) return { error: "Please add a quick note about the visit." };
  const supabase = createAdminClient();
  const who = session.role === "admin" ? "Nate" : session.role === "dispatcher" ? "Ahsin" : session.name;

  const { error } = await supabase
    .from("route_prospect_visits")
    .update({ status: "visited", visited_at: new Date().toISOString(), notes: trimmed })
    .eq("id", id);
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };

  // Visit touchpoint (best-effort) — drives the visit history + overdue logic.
  // First contact also moves a fresh prospect along the pipeline.
  await supabase.from("prospect_touchpoints").insert({
    prospect_id: prospectId,
    type: "visit",
    note: trimmed,
    created_by: who,
  });
  await supabase.from("prospects").update({ status: "working" }).eq("id", prospectId).eq("status", "new");

  revalidatePath("/driver");
  revalidatePath("/dispatch");
  revalidatePath("/sales/prospects");
  return { success: true };
}
