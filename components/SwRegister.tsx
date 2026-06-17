"use client";

import { useEffect } from "react";

// Registers the offline app-shell service worker. Production only - in dev a
// caching SW fights hot reload and causes exactly the stale-page bugs we hate.
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    // When a new service worker takes control (after a deploy), reload once so
    // the open app picks up the fresh code instead of running the old cached
    // bundle. Guarded so it can't loop.
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);
  return null;
}
