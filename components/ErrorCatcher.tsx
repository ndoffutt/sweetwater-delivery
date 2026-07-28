"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/actions/clientError";

// Catches errors that React error boundaries DON'T: uncaught exceptions in
// async code / event handlers, and unhandled promise rejections. These are the
// silent failures that leave the app half-broken without ever tripping a
// boundary. We log them (deduped + throttled) so we finally have visibility
// into what's actually going wrong in the field. Purely a reporter - it never
// changes app behavior or shows UI.
export default function ErrorCatcher() {
  useEffect(() => {
    const seen = new Set<string>();
    let sent = 0;
    const MAX = 20; // don't flood on a render loop

    function report(source: string, message: string, stack?: string | null) {
      if (sent >= MAX) return;
      const key = `${source}:${message}`.slice(0, 200);
      if (seen.has(key)) return;
      seen.add(key);
      sent++;
      void logClientError({
        message,
        stack: stack ?? null,
        source,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    }

    const onError = (e: ErrorEvent) => {
      report("window.onerror", e.message || "Uncaught error", e.error?.stack ?? null);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const message = r instanceof Error ? r.message : String(r ?? "Unhandled rejection");
      report("unhandledrejection", message, r instanceof Error ? r.stack : null);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
