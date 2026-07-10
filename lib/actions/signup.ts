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

  // Confirm interest by email (best-effort — a mail hiccup must never fail the
  // signup). States the card-on-file requirement so eligibility is clear up
  // front: new accounts activate only once a card is on file.
  const email = input.email?.trim();
  if (email) await sendInterestEmail(email, fullName.split(/\s+/)[0]).catch(() => {});
  return { success: true };
}

const SHOP_PHONE_DISPLAY = "(631) 537-5120";
const SHOP_PHONE_TEL = "+16315375120";

async function sendInterestEmail(to: string, firstName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // staging has no key — silently skip
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Sweetwater's Delivery <admin@sweetwaterscleaners.com>",
    to,
    subject: "Sweetwater's Delivery — one step left to activate your service",
    html: `
      <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <div style="background: #02733e; padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <div style="color: #FAF6EC; font-size: 26px;">Sweetwater's Cleaners</div>
          <div style="color: #d59a29; font-size: 11px; letter-spacing: 3px; text-transform: uppercase; margin-top: 6px;">Hamptons Delivery</div>
        </div>
        <div style="background: #FAF6EC; padding: 28px 24px; border-radius: 0 0 12px 12px; font-family: Verdana, sans-serif; font-size: 14px; line-height: 1.6;">
          <p>Hi ${firstName},</p>
          <p>Thanks for requesting complimentary pickup &amp; delivery — we received your sign-up.</p>
          <p style="background: #fff; border: 1px solid #d59a29; border-radius: 10px; padding: 14px 16px;">
            <b>One step left:</b> to be eligible for delivery service, we need a credit card
            on file. Please call us at <a href="tel:${SHOP_PHONE_TEL}" style="color: #02733e; font-weight: bold;">${SHOP_PHONE_DISPLAY}</a>
            and we'll set it up in under two minutes.
          </p>
          <p>You're only ever charged for cleaning performed — pickup and delivery are
          always complimentary within our service area.</p>
          <p style="margin-top: 20px;">See you on the route,<br/>Sweetwater's Cleaners<br/>
          <span style="color: #777; font-size: 12px;">350 Montauk Hwy, Wainscott · ${SHOP_PHONE_DISPLAY}</span></p>
        </div>
      </div>`,
  });
}
