"use client";

import { useEffect } from "react";
import { logClientError } from "@/lib/actions/clientError";

// Last-resort boundary: fires when the ROOT layout itself throws. It replaces
// the entire document, so it must render its own <html>/<body> and can't assume
// the app stylesheet loaded - everything here is inline-styled so it always
// shows, even on a total failure.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({
      message: error?.message ?? "Root layout crashed",
      stack: error?.stack ?? null,
      source: "boundary:root",
      digest: error?.digest ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: 24,
          textAlign: "center",
          background: "#eae4d3",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#2b2b2b",
        }}
      >
        <div>
          <div style={{ fontSize: 30, fontWeight: 300, color: "#02733e", lineHeight: 1 }}>
            Sweetwater&apos;s
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9a7b1f", marginTop: 4 }}>
            Delivery
          </div>
        </div>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 24, fontWeight: 300, margin: 0 }}>App needs a restart</h1>
          <p style={{ fontSize: 14, opacity: 0.6, marginTop: 8 }}>
            Something went wrong loading the app. Your saved work is safe. Tap to reload.
          </p>
        </div>
        <div style={{ width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={() => reset()}
            style={{ width: "100%", minHeight: 44, background: "#02733e", color: "#faf7ef", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.15em", padding: "16px", borderRadius: 12, border: "none" }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ width: "100%", minHeight: 44, background: "#faf7ef", color: "#2b2b2b", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.15em", padding: "16px", borderRadius: 12, border: "1px solid #d8cfb8" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
