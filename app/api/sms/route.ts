import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { smsConfigured, validateTwilioSignature, phoneDigits } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// Twilio webhook: incoming texts to the office number, plus delivery receipts
// for outbound messages. Configure in the Twilio console as
//   https://sweetwater-delivery.vercel.app/api/sms
// for both "A message comes in" and the status callback.
export async function POST(request: NextRequest) {
  if (!smsConfigured()) return new NextResponse("Not configured", { status: 404 });

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });

  // Verify it's really Twilio (signature over the exact public URL + params).
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/sms`;
  const sig = request.headers.get("x-twilio-signature");
  if (!validateTwilioSignature(url, params, sig)) {
    return new NextResponse("Bad signature", { status: 403 });
  }

  const supabase = createAdminClient();

  // Delivery receipt for an outbound message we sent earlier.
  if (params.MessageStatus && params.MessageSid && !params.Body) {
    if (["delivered", "failed", "undelivered"].includes(params.MessageStatus)) {
      await supabase
        .from("messages")
        .update({
          status: params.MessageStatus === "delivered" ? "delivered" : "failed",
          error: params.ErrorCode ? `Twilio error ${params.ErrorCode}` : null,
        })
        .eq("twilio_sid", params.MessageSid);
    }
    return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  }

  // Incoming text: store it and match the sender to a customer by phone.
  const from = params.From ?? "";
  const body = (params.Body ?? "").trim();
  if (from && body) {
    const d = phoneDigits(from);
    const { data: customers } = await supabase
      .from("customers")
      .select("id, phone")
      .eq("active", true)
      .is("deleted_at", null)
      .not("phone", "is", null);
    const match = (customers ?? []).find((c) => phoneDigits(c.phone) === d);

    await supabase.from("messages").insert({
      direction: "inbound",
      phone: from,
      body,
      customer_id: match?.id ?? null,
      status: "received",
      twilio_sid: params.MessageSid ?? null,
    });
  }

  // Empty TwiML: no auto-reply.
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}
