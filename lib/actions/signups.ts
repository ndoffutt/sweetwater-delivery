"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

/**
 * Convert a pending website signup into a customer, then mark it added.
 */
export async function addSignupAsCustomer(signupId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { data: signup, error: fetchErr } = await supabase
    .from("customer_signups")
    .select("id, full_name, address, phone, notes, status")
    .eq("id", signupId)
    .single();
  if (fetchErr || !signup) return { error: "Signup not found" };
  if (signup.status !== "pending") return { error: "Already handled" };

  const { data: customer, error: createErr } = await supabase
    .from("customers")
    .insert({
      name: signup.full_name,
      address: signup.address,
      phone: signup.phone || null,
      delivery_notes: signup.notes || null,
    })
    .select("id")
    .single();
  if (createErr || !customer) {
    return { error: createErr?.message || "Failed to create customer" };
  }

  await supabase
    .from("customer_signups")
    .update({ status: "added", customer_id: customer.id })
    .eq("id", signupId);

  revalidatePath("/dispatch/signups");
  revalidatePath("/dispatch");
  revalidatePath("/dispatch/customers");
  return { success: true };
}

export async function dismissSignup(signupId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("customer_signups")
    .update({ status: "dismissed" })
    .eq("id", signupId);
  if (error) return { error: error.message };

  revalidatePath("/dispatch/signups");
  revalidatePath("/dispatch");
  return { success: true };
}
