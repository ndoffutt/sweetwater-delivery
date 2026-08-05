"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { putSetting } from "@/lib/settings";
import { phoneDigits } from "@/lib/messaging";

const missing = (m?: string) => !!m && /(does not exist|schema cache|could not find)/i.test(m);

// requireSession() only elevates to dispatcher; whether real customers get
// texted is the owner's call alone, so check the role directly.
async function requireOwner() {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("Unauthorized");
  return session;
}

/** Owner-only: this decides whether real customers get texted. */
export async function setAutoTextsOn(on: boolean) {
  const session = await requireOwner();
  const r = await putSetting("auto_texts_on", on ? "1" : "0", session.name);
  if ("error" in r && r.error) {
    return { error: missing(r.error) ? "Run supabase/app_settings.sql first." : r.error };
  }
  revalidatePath("/team");
  return { success: true };
}

/** Empty clears test mode and sends to real customers again. */
export async function setAutoTextsTestTo(phone: string) {
  const session = await requireOwner();
  const trimmed = phone.trim();
  if (trimmed) {
    const d = phoneDigits(trimmed);
    if (d.length !== 10) return { error: "Enter a 10-digit phone number, or clear the field to go live." };
  }
  const r = await putSetting("auto_texts_test_to", trimmed || null, session.name);
  if ("error" in r && r.error) {
    return { error: missing(r.error) ? "Run supabase/app_settings.sql first." : r.error };
  }
  revalidatePath("/team");
  return { success: true };
}
