"use server";

import { createAdminClient } from "@/lib/supabase/admin";

interface PublicSignupInput {
  fullName: string;
  address: string;
  phone: string;
  email?: string;
  notes?: string;
  smsConsent: boolean;
  company?: string; // honeypot — real users leave this blank
}

// Public delivery sign-up from the website opt-in form. Queues the request for
// the manager to review (customer_signups). The SMS-consent checkbox is the
// documented opt-in for the A2P 10DLC program, so we record when/what was
// agreed to in the notes for an audit trail.
export async function submitPublicSignup(input: PublicSignupInput) {
  if (input.company) return { success: true }; // bot trap: silently accept, drop
  const fullName = input.fullName?.trim();
  const address = input.address?.trim();
  const phone = input.phone?.trim();
  if (!fullName || !address) return { error: "Please add your name and address." };
  if (!phone) return { error: "Please add a mobile number." };

  const consentNote = input.smsConsent
    ? `SMS opt-in: agreed to receive delivery text notifications via web form on ${new Date().toISOString().slice(0, 10)}.`
    : `SMS opt-in: NOT given.`;
  const notes = [input.notes?.trim(), consentNote].filter(Boolean).join(" — ");

  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_signups").insert({
    full_name: fullName,
    address,
    phone,
    email: input.email?.trim() || null,
    notes,
  });
  if (error) return { error: "Something went wrong — please call us instead." };
  return { success: true };
}
