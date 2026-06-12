"use client";

import { useEffect } from "react";

// Registers the offline app-shell service worker. Production only - in dev a
// caching SW fights hot reload and causes exactly the stale-page bugs we hate.
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
