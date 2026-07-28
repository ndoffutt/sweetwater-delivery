"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/actions/clientError";

// Route-segment error boundary for the WHOLE driver flow. If any driver screen
// throws, the driver sees a calm, branded recovery screen with a big tap target
// instead of a dead white page - and the crash is logged so we can fix it.
// Their route work is saved locally and syncs on its own, so recovery is safe.
export default function DriverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({
      message: error?.message ?? "Driver screen crashed",
      stack: error?.stack ?? null,
      source: "boundary:driver",
      digest: error?.digest ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  }, [error]);

  return (
    <div className="fixed inset-0 bg-cream-dark flex flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <div className="font-serif text-3xl font-light text-green-primary leading-none">
          Sweetwater&apos;s
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark mt-1">
          Delivery
        </div>
      </div>

      <div className="max-w-sm">
        <h1 className="font-serif text-2xl font-light text-charcoal">Something hiccuped</h1>
        <p className="text-sm text-charcoal/60 font-body mt-2">
          The app hit a snag, but <b>your route is safe</b> — anything you already
          marked is saved and will sync on its own. Tap below to get back to it.
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => reset()}
          className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-4 rounded-xl active:scale-[0.98] transition-transform"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full min-h-tap bg-cream border border-cream-dark text-charcoal/70 font-body text-sm uppercase tracking-widest py-4 rounded-xl active:scale-[0.98] transition-transform"
        >
          Reload the app
        </button>
        <a
          href="/driver"
          className="w-full min-h-tap flex items-center justify-center text-charcoal/45 font-body text-xs uppercase tracking-widest py-2"
        >
          Back to my route
        </a>
      </div>
    </div>
  );
}
