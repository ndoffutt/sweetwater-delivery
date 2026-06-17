// Public SMS program terms - required by carriers (TCR/A2P 10DLC) for the SMS
// program. Linked from the campaign registration; must stay publicly reachable.

export const metadata = { title: "Messaging Terms · Sweetwater's Cleaners" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl font-light text-charcoal">
          Messaging Terms &amp; Conditions
        </h1>
        <p className="font-body text-xs uppercase tracking-widest text-charcoal/40 mt-2">
          Sweetwater&apos;s Cleaners Delivery Notifications
        </p>

        <div className="font-body text-[15px] leading-relaxed text-charcoal/80 mt-8 space-y-5">
          <p>
            <strong>Program:</strong> Sweetwater&apos;s Cleaners Delivery Notifications. Customers
            who opt in receive text messages about their dry cleaning deliveries and pickups, such
            as a message when a delivery is on the way and when it has been completed, and may
            exchange customer-service messages with our team by replying to our business number.
          </p>
          <p>
            <strong>Opt-in:</strong> You consent to receive these messages by checking the SMS
            consent box on our{" "}
            <a href="/signup" className="text-green-primary underline underline-offset-2">online sign-up form</a>,
            by giving consent in person at our store, or by texting our business number first.
            Consent is not a condition of purchase, and text notifications are not required to
            receive delivery service.
          </p>
          <p>
            <strong>Message frequency</strong> varies based on your delivery schedule, typically a
            few messages per delivery day.
          </p>
          <p>
            <strong>Message and data rates may apply</strong> depending on your mobile carrier and
            plan. Carriers are not liable for delayed or undelivered messages.
          </p>
          <p>
            <strong>Opt-out:</strong> Reply <strong>STOP</strong> to any message to stop receiving
            texts at any time. After opting out you will receive one final confirmation message.
          </p>
          <p>
            <strong>Help:</strong> Reply <strong>HELP</strong> to any message, or contact
            Sweetwater&apos;s Cleaners at our Wainscott or Hampton Bays locations, for assistance.
          </p>
          <p>
            See our <a href="/privacy" className="text-green-primary underline underline-offset-2">Privacy Policy</a>{" "}
            for how we handle your information. Mobile opt-in data is never shared with third
            parties for marketing purposes.
          </p>
        </div>
      </div>
    </main>
  );
}
