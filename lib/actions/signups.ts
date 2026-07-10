"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { parseAddress } from "@/lib/address";

/**
 * Convert a pending website signup into a customer, then mark it added.
 * Carries over the email the customer entered on the website form and splits
 * their address into street/town/zip.
 */
export async function addSignupAsCustomer(signupId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { data: signup, error: fetchErr } = await supabase
    .from("customer_signups")
    .select("id, full_name, address, phone, email, notes, status")
    .eq("id", signupId)
    .single();
  if (fetchErr || !signup) return { error: "Signup not found" };
  if (signup.status !== "pending") return { error: "Already handled" };

  const parts = parseAddress(signup.address);
  const full: Record<string, unknown> = {
    name: signup.full_name,
    address: signup.address,
    phone: signup.phone || null,
    delivery_notes: signup.notes || null,
    email: signup.email || null,
    street: parts.street || null,
    town: parts.town || null,
    zip: parts.zip || null,
  };
  // Retry without the newer columns if the email / address-split migration
  // hasn't run yet — the signup still converts (those fields fill in later).
  const legacy: Record<string, unknown> = { ...full };
  for (const col of ["email", "street", "town", "zip"]) delete legacy[col];

  let { data: customer, error: createErr } = await supabase
    .from("customers").insert(full).select("id").single();
  if (createErr && /column|does not exist|schema cache/i.test(createErr.message)) {
    ({ data: customer, error: createErr } = await supabase
      .from("customers").insert(legacy).select("id").single());
  }
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
