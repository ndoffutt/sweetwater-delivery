// Public privacy policy - required by carriers (TCR/A2P 10DLC) for the SMS
// program. Linked from the campaign registration; must stay publicly reachable.

export const metadata = { title: "Privacy Policy · Sweetwater's Cleaners" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="font-serif text-4xl font-light text-charcoal">Privacy Policy</h1>
        <p className="font-body text-xs uppercase tracking-widest text-charcoal/40 mt-2">
          Sweetwater&apos;s Cleaners · Delivery Service
        </p>

        <div className="font-body text-[15px] leading-relaxed text-charcoal/80 mt-8 space-y-5">
          <p>
            Sweetwater&apos;s Cleaners (&quot;we&quot;, &quot;us&quot;) provides dry cleaning pickup and
            delivery service in the Hamptons, New York. This policy describes the information we
            collect from delivery customers and how we use it.
          </p>

          <h2 className="font-serif text-2xl font-light text-charcoal pt-2">What we collect</h2>
          <p>
            To provide delivery service we collect your name, delivery address, phone number, and
            delivery preferences (such as gate codes and drop-off instructions), along with records
            of your deliveries and pickups, including photos taken as proof of delivery.
          </p>

          <h2 className="font-serif text-2xl font-light text-charcoal pt-2">How we use it</h2>
          <p>
            Your information is used solely to operate our delivery service: scheduling and
            completing deliveries, sending you text notifications about your deliveries, and
            responding when you contact us. If you have consented to text notifications, we send
            messages such as delivery status updates from our business number, and you can reply to
            communicate with our team.
          </p>

          <h2 className="font-serif text-2xl font-light text-charcoal pt-2">What we never do</h2>
          <p>
            We do not sell, rent, or share your personal information, including your phone number
            and texting consent, with any third parties or affiliates for their marketing or
            promotional purposes. Mobile opt-in data is never shared with third parties. Your
            information is shared only with the service providers we use to operate the service
            (such as our messaging and hosting providers), and only as needed to deliver it.
          </p>

          <h2 className="font-serif text-2xl font-light text-charcoal pt-2">Text messaging</h2>
          <p>
            Text notifications are optional and not required to receive service. Message frequency
            varies with your deliveries. Message and data rates may apply. Reply{" "}
            <strong>STOP</strong> at any time to stop receiving texts, or <strong>HELP</strong> for
            help.
          </p>

          <h2 className="font-serif text-2xl font-light text-charcoal pt-2">Contact</h2>
          <p>
            Questions about this policy or your information? Contact Sweetwater&apos;s Cleaners at
            our Wainscott or Hampton Bays locations, or text or call our business number.
          </p>
        </div>
      </div>
    </main>
  );
}
