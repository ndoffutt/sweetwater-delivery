import PublicSignupForm from "@/components/PublicSignupForm";

export const metadata = {
  title: "Start Delivery Service · Sweetwater's Cleaners",
  description:
    "Sign up for Sweetwater's Cleaners dry cleaning pickup & delivery in the Hamptons, and opt in to SMS delivery notifications.",
};

// Public opt-in / sign-up page — the documented Call-to-Action for the SMS
// program (A2P 10DLC). Must stay publicly reachable (see middleware allowlist).
export default function SignupPage() {
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
          <h2 className="font-serif text-2xl font-light text-cream">Start delivery service</h2>
          <p className="font-body text-sm text-cream/70 mt-2">
            Dry cleaning pickup &amp; delivery to your door. Add your info below and our team will
            get you set up.
          </p>
        </div>

        <PublicSignupForm />

        <p className="font-body text-[11px] text-cream/50 text-center mt-6 leading-relaxed">
          Sweetwater&apos;s Cleaners — Wainscott &amp; Hampton Bays, NY.{" "}
          <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a> ·{" "}
          <a href="/terms" className="underline underline-offset-2">Messaging Terms</a>
        </p>
      </div>
    </main>
  );
}
