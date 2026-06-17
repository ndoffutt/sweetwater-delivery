"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { geocodeBusiness } from "@/lib/prospectGeo";
import { townFromAddress } from "@/lib/town";
import type { ProspectBusinessType, ProspectService, ProspectStatus, TouchpointType } from "@/lib/types";

interface ProspectInput {
  name: string;
  contact_name?: string;
  contact_title?: string;
  phone?: string;
  email?: string;
  address?: string;
  town?: string;
  website?: string;
  business_type?: ProspectBusinessType;
  services?: ProspectService[];
  notes?: string;
}

// True when an error is the prospect_town migration not having run yet. Covers
// both Postgres ("column ... does not exist", 42703) and PostgREST
// ("Could not find the 'town' column ... in the schema cache", PGRST204).
const missingTown = (msg: string | undefined) =>
  !!msg && /town/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);

export async function createProspect(input: ProspectInput) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const row = {
    name: input.name,
    contact_name: input.contact_name || null,
    contact_title: input.contact_title || null,
    phone: input.phone || null,
    email: input.email || null,
    address: input.address || null,
    // Auto-tag the town from the address unless one was given explicitly.
    town: input.town?.trim() || townFromAddress(input.address) || null,
    website: input.website || null,
    business_type: input.business_type || "other",
    notes: input.notes || null,
  };
  let { data, error } = await supabase.from("prospects").insert(row).select().single();
  if (error && missingTown(error.message)) {
    const { town, ...rest } = row;
    void town;
    ({ data, error } = await supabase.from("prospects").insert(rest).select().single());
  }
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { prospect: data };
}

export async function updateProspect(
  id: string,
  fields: Partial<ProspectInput> & { status?: ProspectStatus }
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { ...fields };
  // Address changed → re-pin on the map (null falls back to page-load
  // geocoding) and re-derive the town tag unless one was set explicitly.
  if (fields.address !== undefined) {
    const coords = await geocodeBusiness(fields.name ?? "", fields.address ?? null);
    patch.lat = coords?.lat ?? null;
    patch.lng = coords?.lng ?? null;
    if (fields.town === undefined) patch.town = townFromAddress(fields.address);
  }
  if (typeof patch.town === "string") patch.town = (patch.town as string).trim() || null;
  let { error } = await supabase.from("prospects").update(patch).eq("id", id);
  if (error && missingTown(error.message)) {
    const { town, ...rest } = patch;
    void town;
    ({ error } = await supabase.from("prospects").update(rest).eq("id", id));
  }
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { success: true };
}

export async function logTouchpoint(
  prospectId: string,
  type: TouchpointType,
  note?: string,
  date?: string // YYYY-MM-DD; defaults to now
) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  // Attribution: the Owner login is Nate, the Manager login is Ahsin.
  const who =
    session.role === "admin" ? "Nate" : session.role === "dispatcher" ? "Ahsin" : session.name;
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    prospect_id: prospectId,
    note: note?.trim() || null,
    created_by: who,
    // Backdated entries land at noon ET on the chosen day.
    ...(date && date !== today ? { created_at: `${date}T12:00:00-04:00` } : {}),
  };
  let { data, error } = await supabase
    .from("prospect_touchpoints")
    .insert({ ...base, type })
    .select()
    .single();
  // 'delivery' is a newer type; fall back to 'visit' if that migration hasn't run.
  if (error && type === "delivery") {
    ({ data, error } = await supabase
      .from("prospect_touchpoints")
      .insert({ ...base, type: "visit", note: base.note ?? "Delivery" })
      .select()
      .single());
  }
  if (error) return { error: error.message };
  // First contact moves a fresh prospect along the pipeline automatically.
  await supabase
    .from("prospects")
    .update({ status: "working" })
    .eq("id", prospectId)
    .eq("status", "new");
  revalidatePath("/sales/prospects");
  return { touchpoint: data };
}

/** Edit a previously logged touch (type / note / date). Keeps the original author. */
export async function updateTouchpoint(
  id: string,
  fields: { type?: TouchpointType; note?: string; date?: string } // date = YYYY-MM-DD
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (fields.type !== undefined) patch.type = fields.type;
  if (fields.note !== undefined) patch.note = fields.note.trim() || null;
  // Edited date lands at noon ET on the chosen day, matching how touches log.
  if (fields.date) patch.created_at = `${fields.date}T12:00:00-04:00`;
  const { data, error } = await supabase
    .from("prospect_touchpoints")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { touchpoint: data };
}

export async function deleteTouchpoint(id: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("prospect_touchpoints").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { success: true };
}

export async function deleteProspect(id: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("prospects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { success: true };
}

/**
 * Mark a prospect active and create a matching customer in the delivery
 * directory (skipped if already converted).
 */
export async function convertProspectToCustomer(id: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { data: prospect, error: fetchError } = await supabase
    .from("prospects")
    .select("id,name,address,phone,notes,customer_id")
    .eq("id", id)
    .single();
  if (fetchError || !prospect) return { error: fetchError?.message ?? "Prospect not found" };
  if (prospect.customer_id) return { error: "Already converted to a customer" };

  // Never double-add: if a customer with this name already exists, link to it.
  const norm = (s: string) => s.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]/g, "");
  const { data: existingCustomers } = await supabase
    .from("customers")
    .select("id,name")
    .eq("active", true)
    .is("deleted_at", null);
  const existing = (existingCustomers ?? []).find((c) => norm(c.name) === norm(prospect.name));

  let customer = existing ?? null;
  if (!customer) {
    const { data: created, error: insertError } = await supabase
      .from("customers")
      .insert({
        name: prospect.name,
        address: prospect.address || "Address needed",
        phone: prospect.phone || null,
        delivery_notes: prospect.notes || null,
        tags: ["Commercial"],
      })
      .select()
      .single();
    if (insertError) return { error: insertError.message };
    customer = created;
  }
  if (!customer) return { error: "Could not create customer" };

  const { error: updateError } = await supabase
    .from("prospects")
    .update({ status: "active", customer_id: customer.id })
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  revalidatePath("/sales/prospects");
  revalidatePath("/dispatch/customers");
  return { customer };
}
