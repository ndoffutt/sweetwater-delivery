"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { recordAndSend, placeBridgeCall, phoneDigits, callConfigured, canTransmitSms } from "@/lib/messaging";

/** Send a text from the office number. During Twilio rollout only the Owner
 *  (Nate) actually transmits; other logins record the message as pending. */
export async function sendThreadMessage(phone: string, body: string) {
  const session = await requireSession();
  const text = body.trim();
  if (!text) return { error: "Empty message" };
  if (phoneDigits(phone).length !== 10) return { error: "Invalid phone number" };

  // Attach to the matching customer so the thread shows on their card.
  const supabase = createAdminClient();
  const d = phoneDigits(phone);
  const { data: customers } = await supabase
    .from("customers")
    .select("id, phone")
    .eq("active", true)
    .is("deleted_at", null)
    .not("phone", "is", null);
  const match = (customers ?? []).find((c) => phoneDigits(c.phone) === d);

  const res = await recordAndSend({
    phone,
    body: text,
    customerId: match?.id ?? null,
    senderName: session.name,
    transmit: canTransmitSms(session.role),
  });
  if (res.status === "failed") return { error: res.error || "Couldn't send" };
  return { success: true, status: res.status };
}

/** Mark a conversation's inbound messages as read. */
export async function markThreadRead(phone: string) {
  await requireSession();
  const supabase = createAdminClient();
  const d = phoneDigits(phone);
  // Phone formats vary ("+1631..." vs "(631) ..."), so match in JS, not SQL.
  const { data } = await supabase
    .from("messages")
    .select("id, phone")
    .eq("direction", "inbound")
    .is("read_at", null);
  const ids = ((data ?? []) as { id: string; phone: string }[])
    .filter((m) => phoneDigits(m.phone) === d)
    .map((m) => m.id);
  if (ids.length) {
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", ids);
  }
  return { success: true };
}

/**
 * Call a customer through the office number: Twilio rings your cell first,
 * then connects the customer (they see the office number as caller ID).
 */
export async function callFromOfficeLine(phone: string) {
  await requireSession();
  if (!callConfigured()) return { error: "Calling isn't set up yet" };
  return placeBridgeCall(phone);
}
