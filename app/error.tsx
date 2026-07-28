"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/actions/clientError";

// App-wide error boundary for everything outside the driver flow (dispatch,
// owner, sales, customers…). Catches render/runtime errors in those segments so
// staff see a recovery screen instead of a broken page, and the crash is logged.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({
      message: error?.message ?? "App screen crashed",
      stack: error?.stack ?? null,
      source: "boundary:app",
      digest: error?.digest ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <div className="font-serif text-3xl font-light text-green-primary leading-none">
          Sweetwater&apos;s
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark mt-1">
          Operations
        </div>
      </div>
      <div className="max-w-sm">
        <h1 className="font-serif text-2xl font-light text-charcoal">Something went wrong</h1>
        <p className="text-sm text-charcoal/60 font-body mt-2">
          This page hit an error. It&apos;s been logged. Try again, or reload.
        </p>
      </div>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => reset()}
          className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-4 rounded-xl"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full min-h-tap bg-cream border border-cream-dark text-charcoal/70 font-body text-sm uppercase tracking-widest py-4 rounded-xl"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
