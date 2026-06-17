"use client";

import { useState, useTransition } from "react";
import { submitPublicSignup } from "@/lib/actions/signup";

export default function PublicSignupForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [consent, setConsent] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    start(async () => {
      const res = await submitPublicSignup({
        fullName: (fd.get("fullName") as string) || "",
        address: (fd.get("address") as string) || "",
        phone: (fd.get("phone") as string) || "",
        email: (fd.get("email") as string) || undefined,
        notes: (fd.get("notes") as string) || undefined,
        smsConsent: consent,
        company: (fd.get("company") as string) || undefined,
      });
      if (res.error) { setError(res.error); return; }
      setDone(true);
    });
  }

  const field =
    "w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";

  if (done) {
    return (
      <div className="bg-cream rounded-2xl border border-cream-dark p-6 text-center">
        <p className="font-serif text-2xl font-light text-charcoal">Thanks — you&apos;re on the list!</p>
        <p className="font-body text-sm text-charcoal/60 mt-2">
          We&apos;ll reach out to set up your delivery service. If you opted in to texts,
          you&apos;ll get delivery updates from our business number.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-cream rounded-2xl border border-cream-dark p-5 md:p-6 space-y-3">
      {/* honeypot */}
      <input name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <input name="fullName" placeholder="Full name" required className={field} />
      <input name="address" placeholder="Delivery address" required className={field} />
      <input name="phone" type="tel" placeholder="Mobile number" required className={field} />
      <input name="email" type="email" placeholder="Email (optional)" className={field} />
      <textarea name="notes" placeholder="Anything we should know? (optional)" rows={2} className={`${field} resize-none`} />

      <label className="flex items-start gap-3 pt-1 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-green-primary"
        />
        <span className="font-body text-xs leading-relaxed text-charcoal/70">
          By checking this box, I agree to receive recurring SMS text messages (delivery
          notifications and customer-service replies) from Sweetwater&apos;s Cleaners at the mobile
          number provided. Consent is not a condition of purchase. Message frequency varies. Message
          and data rates may apply. Reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for
          help. See our{" "}
          <a href="/privacy" target="_blank" className="text-green-primary underline underline-offset-2">Privacy Policy</a>{" "}
          and{" "}
          <a href="/terms" target="_blank" className="text-green-primary underline underline-offset-2">Messaging Terms</a>.
        </span>
      </label>

      {error && <p className="font-body text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3.5 rounded-lg disabled:opacity-60"
      >
        {pending ? "Sending…" : "Request delivery service"}
      </button>
      <p className="font-body text-[11px] text-charcoal/40 text-center">
        Leave the SMS box unchecked and we&apos;ll still set up delivery — texts are optional.
      </p>
    </form>
  );
}
