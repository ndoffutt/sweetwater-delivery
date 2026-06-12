// Offline app shell for the driver PWA. Strategy:
//  - Page navigations: network-first (4s timeout), falling back to the last
//    cached copy, so the app still opens in a dead zone after a restart.
//  - Hashed build assets (/_next/static): cache-first, they're immutable.
//  - APIs, server actions, and cross-origin (Mapbox/Supabase): untouched -
//    the in-app queues (lib/offline.ts) own write resilience.
const CACHE = "sw-shell-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        caches.match(req, { ignoreSearch: true }).then((hit) => {
          if (hit && !settled) {
            settled = true;
            resolve(hit);
          }
        });
      }
    }, 4000);

    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        if (!settled) {
          settled = true;
          resolve(res);
        }
      })
      .catch(async () => {
        clearTimeout(timer);
        if (settled) return;
        const hit =
          (await caches.match(req, { ignoreSearch: true })) ||
          (new URL(req.url).pathname.startsWith("/driver")
            ? await caches.match("/driver")
            : undefined);
        settled = true;
        resolve(
          hit ||
            new Response("Offline - reconnect to load this page.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
        );
      });
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Mapbox/Supabase: hands off
  if (url.pathname.startsWith("/api/")) return; // live data + queues handle this

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Page navigations: network-first with offline fallback.
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req));
  }
});
