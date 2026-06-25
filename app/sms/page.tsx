import PublicSignupForm from "@/components/PublicSignupForm";

export const metadata = {
  title: "Text Sign-Up · Sweetwater's Cleaners",
  description:
    "Opt in to SMS delivery notifications from Sweetwater's Cleaners and request dry cleaning pickup & delivery in the Hamptons.",
};

// Public SMS opt-in / sign-up page — the documented Call-to-Action for the
// A2P 10DLC campaign. Must stay publicly reachable (see middleware allowlist).
export default function SmsOptInPage() {
  return (
    <main className="min-h-screen bg-green-primary">
      <div className="max-w-lg mx-auto px-5 py-12">
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl font-light text-cream">Sweetwater&apos;s</h1>
          <p className="font-body text-xs uppercase tracking-widest text-gold-primary mt-2">
            Cleaners · Hamptons Delivery
          </p>
        </div>

        <div className="text-center mb-6">
          <h2 className="font-serif text-2xl font-light text-cream">Delivery &amp; Text Sign-Up</h2>
          <p className="font-body text-sm text-cream/70 mt-2">
            Request complimentary dry cleaning pickup &amp; delivery, and opt in to text
            notifications about your deliveries from our business number.
          </p>
        </div>

        <PublicSignupForm />

        <p className="font-body text-[11px] text-cream/60 text-center mt-6 leading-relaxed">
          Text notifications are part of the Sweetwater&apos;s Cleaners Delivery Notifications
          program. Message frequency varies. Message and data rates may apply. Reply STOP to opt
          out, HELP for help.
        </p>
        <p className="font-body text-[11px] text-cream/50 text-center mt-3 leading-relaxed">
          Sweetwater&apos;s Cleaners — Wainscott &amp; Hampton Bays, NY.{" "}
          <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a> ·{" "}
          <a href="/terms" className="underline underline-offset-2">Messaging Terms</a>
        </p>
      </div>
    </main>
  );
}
