"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import type { ProspectBusinessType, ProspectService, ProspectStatus, TouchpointType } from "@/lib/types";

interface ProspectInput {
  name: string;
  contact_name?: string;
  contact_title?: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  business_type?: ProspectBusinessType;
  services?: ProspectService[];
  notes?: string;
}

export async function createProspect(input: ProspectInput) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prospects")
    .insert({
      name: input.name,
      contact_name: input.contact_name || null,
      contact_title: input.contact_title || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      website: input.website || null,
      business_type: input.business_type || "other",
      notes: input.notes || null,
    })
    .select()
    .single();
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
  const { error } = await supabase.from("prospects").update(fields).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales/prospects");
  return { success: true };
}

export async function logTouchpoint(prospectId: string, type: TouchpointType, note?: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prospect_touchpoints")
    .insert({
      prospect_id: prospectId,
      type,
      note: note?.trim() || null,
      created_by: session.name,
    })
    .select()
    .single();
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

  const { data: customer, error: insertError } = await supabase
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

  const { error: updateError } = await supabase
    .from("prospects")
    .update({ status: "active", customer_id: customer.id })
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  revalidatePath("/sales/prospects");
  revalidatePath("/dispatch/customers");
  return { customer };
}
