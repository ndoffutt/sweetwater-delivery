"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

export type CommentEntity = "customer_issue" | "action_item";

export interface EntityComment {
  id: string;
  entity_type: string;
  entity_id: string;
  body: string;
  author: string | null;
  created_at: string;
}

const missing = (m?: string) => !!m && /(does not exist|schema cache|could not find)/i.test(m);
const NEEDS = "Run supabase/comments_and_resolution.sql first.";

export async function addEntityComment(entityType: CommentEntity, entityId: string, body: string) {
  const session = await requireSession("dispatcher");
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("entity_comments")
    .insert({ entity_type: entityType, entity_id: entityId, body: trimmed, author: session.name })
    .select("id, entity_type, entity_id, body, author, created_at")
    .single();
  if (error) return { error: missing(error.message) ? NEEDS : error.message };
  revalidatePath("/reports");
  revalidatePath("/today");
  return { comment: data as EntityComment };
}

export async function removeEntityComment(id: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  let { error } = await supabase
    .from("entity_comments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.id })
    .eq("id", id);
  if (error && missing(error.message)) {
    ({ error } = await supabase.from("entity_comments").delete().eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/reports");
  revalidatePath("/today");
  return { success: true };
}

/**
 * A comment on a touchpoint in the weekly update is written back to the
 * prospect itself, as a `note` touchpoint — so it lands in the Prospects
 * touchpoint log and the prospect's own history rather than living only
 * inside one week's update.
 *
 * Deliberately type 'note': notes are excluded from the outreach clock
 * everywhere else, so adding context can't masquerade as contact and quietly
 * reset a prospect's check-in timer.
 */
export async function addTouchpointNote(prospectId: string, body: string) {
  const session = await requireSession("dispatcher");
  const trimmed = body.trim();
  if (!trimmed) return { error: "Write something first." };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prospect_touchpoints")
    .insert({ prospect_id: prospectId, type: "note", note: trimmed, created_by: session.name })
    .select("id, type, note, created_by, created_at")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/reports");
  revalidatePath("/prospects/touchpoints");
  revalidatePath("/sales/prospects");
  return { note: data as { id: string; type: string; note: string | null; created_by: string | null; created_at: string } };
}
