// Core messaging: one business number (the office line, SMS-enabled via Twilio
// Hosted SMS), shared inbox across manager / office / driver devices.
//
// Dark-mode by design: with no Twilio env vars set, everything still works -
// messages are recorded with status "pending" and simply don't transmit. Add
// the credentials and the same code starts sending for real. Env vars:
//
//   TWILIO_ACCOUNT_SID   - from the Twilio console
//   TWILIO_AUTH_TOKEN    - from the Twilio console
//   TWILIO_NUMBER        - the office number once Hosted SMS is live (+1631...)
//   TWILIO_BRIDGE_PHONE  - the cell Twilio rings first for app-placed calls

import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_NUMBER;
const BRIDGE = process.env.TWILIO_BRIDGE_PHONE;

export const smsConfigured = () => Boolean(SID && TOKEN && FROM);
export const callConfigured = () => Boolean(SID && TOKEN && FROM && BRIDGE);

// Rollout gate: during the initial Twilio launch, ONLY the Owner (Nate, role
// "admin") actually transmits SMS — every other login records the message as
// pending, so it's saved in the app but never leaves. Widen this list (e.g.
// add "dispatcher") to open sending up to the Manager later.
export const canTransmitSms = (role: string | null | undefined) => role === "admin";

/** Last 10 digits - the key used to match numbers to customers and threads. */
export const phoneDigits = (p: string | null | undefined) =>
  (p || "").replace(/\D/g, "").slice(-10);

/** "+16315551234" for the Twilio API. */
export const toE164 = (p: string) => {
  const d = phoneDigits(p);
  return d.length === 10 ? `+1${d}` : p;
};

async function twilioPost(
  resource: "Messages" | "Calls",
  params: Record<string, string>
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/${resource}.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params).toString(),
      }
    );
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message || `Twilio ${res.status}` };
    return { ok: true, sid: data.sid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}

/**
 * Record an outbound message and (if Twilio is configured) actually send it.
 * Falls back to the legacy text_messages table if the messages table hasn't
 * been migrated yet, so existing flows never break.
 */
export async function recordAndSend(opts: {
  phone: string;
  body: string;
  customerId?: string | null;
  stopId?: string | null;
  senderName?: string | null;
  // Whether this send is actually allowed to leave the app (rollout gate, see
  // canTransmitSms). When false the message is recorded as pending only.
  transmit?: boolean;
}): Promise<{ id?: string; status: string; error?: string }> {
  const supabase = createAdminClient();

  const { data: row, error: insErr } = await supabase
    .from("messages")
    .insert({
      direction: "outbound",
      phone: opts.phone,
      body: opts.body,
      customer_id: opts.customerId ?? null,
      stop_id: opts.stopId ?? null,
      sender_name: opts.senderName ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insErr || !row) {
    // messages table not migrated yet: keep the old queue behavior.
    await supabase.from("text_messages").insert({
      stop_id: opts.stopId ?? null,
      customer_phone: opts.phone,
      message: opts.body,
      status: "pending",
    });
    return { status: "pending" };
  }

  // Not configured, or this sender isn't cleared to transmit yet → record only.
  if (!smsConfigured() || !opts.transmit) return { id: row.id, status: "pending" };

  const sent = await twilioPost("Messages", {
    // Normalize the office number to E.164 (+1…) — Twilio rejects a "From" like
    // "631-537-5120", so accept whatever format the env var was entered in.
    From: toE164(FROM!),
    To: toE164(opts.phone),
    Body: opts.body,
    // Delivery receipts post back here and flip the bubble to delivered/failed.
    StatusCallback: `${process.env.APP_URL ?? "https://sweetwater-delivery.vercel.app"}/api/sms`,
  });
  await supabase
    .from("messages")
    .update(
      sent.ok
        ? { status: "sent", twilio_sid: sent.sid }
        : { status: "failed", error: sent.error }
    )
    .eq("id", row.id);
  return { id: row.id, status: sent.ok ? "sent" : "failed", error: sent.error };
}

/**
 * App-placed call through the office number: Twilio rings the bridge phone
 * (your cell) first; when answered it dials the customer, who sees the office
 * number as caller ID.
 */
export async function placeBridgeCall(customerPhone: string): Promise<{ error?: string }> {
  if (!callConfigured()) return { error: "Calling isn't set up yet" };
  const twiml = `<Response><Say voice="alice">Connecting you to the customer.</Say><Dial callerId="${toE164(FROM!)}">${toE164(customerPhone)}</Dial></Response>`;
  const res = await twilioPost("Calls", {
    From: toE164(FROM!),
    To: toE164(BRIDGE!),
    Twiml: twiml,
  });
  return res.ok ? {} : { error: res.error };
}

/**
 * Validate Twilio's webhook signature (HMAC-SHA1 of the exact public URL plus
 * the sorted POST params, keyed by the auth token).
 */
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  if (!TOKEN || !signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = createHmac("sha1", TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
  return expected === signature;
}
