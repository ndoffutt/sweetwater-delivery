// TEMPORARY diagnostic — admin-only. Answers the one question that actually
// blocked SMS last time: is the office number really in the Messaging Service's
// sender pool? Hosted SMS failing left the pool empty, which surfaced as the
// opaque error 21703 ("From: N/A") on every send attempt.
//
// Reports configuration and pool membership only. Never returns the auth token,
// and never sends a message. Delete once texting is confirmed working.
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

const API = "https://api.twilio.com/2010-04-01";
const MSG_API = "https://messaging.twilio.com/v1";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user || user.role !== "admin")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const auth = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_NUMBER || "").trim();
  const msgsvc = (process.env.TWILIO_MESSAGING_SERVICE_SID || "").trim();

  const out: Record<string, unknown> = {
    hasAccountSid: Boolean(sid),
    hasAuthToken: Boolean(auth),
    officeNumber: from || null,
    messagingServiceSid: msgsvc || null,
  };
  if (!sid || !auth) return NextResponse.json({ ...out, verdict: "Twilio credentials missing" });

  const creds = Buffer.from(`${sid}:${auth}`).toString("base64");
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { Authorization: `Basic ${creds}` }, cache: "no-store" });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  // Compare on digits only — the pool reports E.164, env vars may not.
  const digits = (s: string) => (s || "").replace(/\D/g, "");

  try {
    // Numbers actually owned by the account (a hosted number appears here only
    // once hosting completes).
    const owned = await get(`${API}/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=50`);
    const ownedList = ((owned.body as { incoming_phone_numbers?: { phone_number: string; capabilities?: { sms?: boolean } }[] })
      .incoming_phone_numbers ?? []);
    out.accountNumbers = ownedList.map((n) => ({ number: n.phone_number, sms: n.capabilities?.sms ?? null }));
    out.officeNumberOwnedByAccount = ownedList.some((n) => digits(n.phone_number) === digits(from));

    // The sender pool — the thing that was empty before.
    if (msgsvc) {
      const pool = await get(`${MSG_API}/Services/${msgsvc}/PhoneNumbers?PageSize=50`);
      out.senderPoolStatus = pool.status;
      const poolList = ((pool.body as { phone_numbers?: { phone_number: string }[] }).phone_numbers ?? []);
      out.senderPool = poolList.map((n) => n.phone_number);
      out.officeNumberInSenderPool = poolList.some((n) => digits(n.phone_number) === digits(from));
      out.senderPoolEmpty = poolList.length === 0;
    }

    const ready =
      Boolean(msgsvc) && out.officeNumberInSenderPool === true;
    out.verdict = ready
      ? "Ready — the office number is in the sender pool. Sending should work."
      : out.senderPoolEmpty
      ? "NOT ready — sender pool is empty. Hosting hasn't attached the number yet (this is what caused error 21703)."
      : out.officeNumberOwnedByAccount === false
      ? "NOT ready — the office number isn't on this Twilio account yet, so hosting hasn't completed."
      : "NOT ready — number not found in the sender pool.";
  } catch (e) {
    out.threw = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
