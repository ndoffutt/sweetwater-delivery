"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { recordAndSend, placeBridgeCall, phoneDigits, callConfigured, canTransmitSms } from "@/lib/messaging";

export interface CustomerMessage {
  id: string;
  direction: string;
  body: string;
  status: string;
  sender_name: string | null;
  created_at: string;
}

/** A customer's recent message history, for the quick-look popup off a stop
 *  card and the customer directory panel — Text still deep-links into the
 *  full thread to reply; this is just enough to see at a glance without
 *  leaving the page. Owner-only, same as the rest of messaging during the
 *  Twilio rollout (see canTransmitSms). */
export async function getCustomerMessages(customerId: string, limit = 10): Promise<CustomerMessage[]> {
  // Read-only, for anyone already trusted with this stop's photos/notes/gate
  // code — driver included. Sending stays admin/dispatcher-only (see
  // canTransmitSms); this is just visibility.
  await requireSession();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, body, status, sender_name, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CustomerMessage[];
}

/** Send a text from the office number. During Twilio rollout only the Owner
 *  (Nate) actually transmits; other logins record the message as pending.
 *  `replyToId` quotes an earlier message, iMessage style. */
export async function sendThreadMessage(phone: string, body: string, replyToId?: string | null) {
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

  // Sending to a thread un-archives it — otherwise the new conversation is
  // invisible in the inbox and the send looks like it did nothing.
  await supabase
    .from("conversation_meta")
    .upsert({ phone_digits: d, archived_at: null }, { onConflict: "phone_digits" })
    .then(() => {}, () => {});

  // Link the reply after the fact so a pre-migration database (no reply_to_id
  // column) still sends the message rather than failing the whole send.
  if (replyToId && res.id) {
    await supabase.from("messages").update({ reply_to_id: replyToId }).eq("id", res.id);
  }

  return { success: true, status: res.status, id: res.id ?? null };
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

/** Flip a conversation back to unread (newest inbound message only). */
export async function markThreadUnread(phone: string) {
  await requireSession();
  const supabase = createAdminClient();
  const d = phoneDigits(phone);
  const { data } = await supabase
    .from("messages")
    .select("id, phone, created_at")
    .eq("direction", "inbound")
    .order("created_at", { ascending: false });
  const newest = ((data ?? []) as { id: string; phone: string }[]).find(
    (m) => phoneDigits(m.phone) === d
  );
  if (newest) await supabase.from("messages").update({ read_at: null }).eq("id", newest.id);
  return { success: true };
}

/** Tapback on a message. Pass null to clear it. */
export async function reactToMessage(messageId: string, reaction: string | null) {
  await requireSession();
  const supabase = createAdminClient();
  const { error } = await supabase.from("messages").update({ reaction }).eq("id", messageId);
  if (error) return { error: "Reactions need the messaging_v2 migration" };
  return { success: true };
}

/** Name a number that isn't in the customer list (vendor, referral, wrong number). */
export async function saveContact(phone: string, name: string, company?: string, notes?: string) {
  await requireSession();
  const d = phoneDigits(phone);
  if (d.length !== 10) return { error: "Invalid phone number" };
  const clean = name.trim();
  if (!clean) return { error: "Name required" };

  const supabase = createAdminClient();
  const { error } = await supabase.from("message_contacts").upsert(
    {
      phone_digits: d,
      name: clean,
      company: company?.trim() || null,
      notes: notes?.trim() || null,
    },
    { onConflict: "phone_digits" }
  );
  if (error) return { error: "Contacts need the messaging_v2 migration" };
  return { success: true };
}

/** Pin a conversation to the top of the list, or unpin it. */
export async function setThreadPinned(phone: string, pinned: boolean) {
  await requireSession();
  const d = phoneDigits(phone);
  const supabase = createAdminClient();
  const { error } = await supabase.from("conversation_meta").upsert(
    { phone_digits: d, pinned_at: pinned ? new Date().toISOString() : null },
    { onConflict: "phone_digits" }
  );
  if (error) return { error: "Pinning needs the messaging_v2 migration" };
  return { success: true };
}

/** Archive a conversation out of the main list, or bring it back. */
export async function setThreadArchived(phone: string, archived: boolean) {
  await requireSession();
  const d = phoneDigits(phone);
  const supabase = createAdminClient();
  const { error } = await supabase.from("conversation_meta").upsert(
    { phone_digits: d, archived_at: archived ? new Date().toISOString() : null },
    { onConflict: "phone_digits" }
  );
  if (error) return { error: "Archiving needs the messaging_v2 migration" };
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
