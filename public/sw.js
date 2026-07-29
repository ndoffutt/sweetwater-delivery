// Offline app shell for the driver PWA.
//
// The driver works in real dead zones — arriving at a stop with no bars is
// normal, not an edge case. Nothing in the driver flow may depend on the
// network being there at that moment.
//
// Strategy:
//  - /driver navigations: network-first (4s), falling back to the cached copy,
//    then the precached /driver shell, then a branded offline page. It must
//    NEVER resolve to a dead error page — that stranded a driver mid-route.
//  - /driver RSC payloads (?_rsc=, Next's client-side route data): cached and
//    served stale on failure, so a failed refresh can't escalate into a hard
//    navigation onto an offline page.
//  - Hashed build assets (/_next/static): cache-first, they're immutable.
//  - APIs, server actions, cross-origin (Mapbox/Supabase): untouched — the
//    in-app queues (lib/offline.ts) own write resilience.
const CACHE = "sw-shell-v5";
const DRIVER_SHELL = "/driver";

// A real page, not a plain-text 503. If the driver ever lands here it explains
// itself and retries on its own the moment signal returns, instead of looking
// like the app died.
const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<title>Sweetwater's — Offline</title></head>
<body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px;text-align:center;background:#eae4d3;color:#2b2b2b;font-family:system-ui,-apple-system,sans-serif">
  <div>
    <div style="font-size:30px;font-weight:300;color:#02733e;line-height:1">Sweetwater's</div>
    <div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#9a7b1f;margin-top:4px">Delivery</div>
  </div>
  <div style="max-width:340px">
    <h1 style="font-size:22px;font-weight:300;margin:0">No signal right now</h1>
    <p style="font-size:14px;opacity:.65;margin-top:8px;line-height:1.5">
      Your route and everything you've marked are saved on this phone. This screen
      reloads by itself as soon as signal comes back — nothing is lost.
    </p>
  </div>
  <button onclick="location.reload()" style="min-height:48px;padding:0 26px;background:#02733e;color:#faf7ef;font-size:14px;text-transform:uppercase;letter-spacing:.15em;border:none;border-radius:12px">Try again</button>
  <script>
    // Retry when the OS reports signal, and poll as a backstop (navigator.onLine
    // is unreliable on iOS — it can read "online" with no usable throughput).
    addEventListener('online', function () { location.reload(); });
    setInterval(function () {
      fetch('/driver', { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { if (r.ok) location.reload(); })
        .catch(function () {});
    }, 5000);
  </script>
</body></html>`;

const offlineResponse = () =>
  new Response(OFFLINE_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });

self.addEventListener("install", (e) => {
  // Precache the driver shell so the offline fallback always exists, even if
  // the driver's first load of the day was some other page.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(DRIVER_SHELL))
      .catch(() => {}) // offline at install: the runtime cache fills in later
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Web Push: show the notification the server sent (visit reminders).
self.addEventListener("push", (e) => {
  let data = { title: "Sweetwater's", body: "", url: "/sales/prospects" };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url || "/sales/prospects" },
    })
  );
});

// Tapping a notification focuses an open tab or opens the target page.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/sales/prospects";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Network-first, but it MUST always resolve — quickly.
//
// A phone in a dead zone does not fail fast: fetch() can hang for a minute or
// more before rejecting, because the radio is attached to a tower and the
// request is simply going nowhere. An earlier version only resolved on timeout
// if a cached copy happened to exist, so with nothing cached the driver stared
// at a frozen app until the OS gave up. Two hard deadlines now guarantee an
// answer:
//   SOFT (2.5s) — hand over the cached copy if we have one. Online this rarely
//                 fires, so a live network still wins and the page stays fresh.
//   HARD (7s)   — give up on the network entirely and serve the last resort.
const SOFT_MS = 2500;
const HARD_MS = 7000;

function networkFirst(req, fallback) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    const lastResort = async () => {
      const hit =
        (await caches.match(req, { ignoreSearch: true })) ||
        (await caches.match(DRIVER_SHELL));
      done(hit || (fallback ? fallback() : offlineResponse()));
    };

    // Soft deadline: prefer a cached copy over making the driver wait.
    const soft = setTimeout(() => {
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) done(hit);
        else caches.match(DRIVER_SHELL).then((shell) => { if (shell) done(shell); });
      });
    }, SOFT_MS);

    // Hard deadline: never leave the page hanging on a request going nowhere.
    const hard = setTimeout(() => { if (!settled) void lastResort(); }, HARD_MS);

    fetch(req)
      .then((res) => {
        clearTimeout(soft);
        clearTimeout(hard);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        done(res);
      })
      .catch(() => {
        clearTimeout(soft);
        clearTimeout(hard);
        if (!settled) void lastResort();
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
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
      )
    );
    return;
  }

  // Next.js client-side route data for the driver flow. Serving these from
  // cache keeps a refresh from failing hard and bouncing the driver to a full
  // page load — which is how a dead zone turned into an offline error screen.
  if (url.pathname.startsWith("/driver") && url.searchParams.has("_rsc")) {
    e.respondWith(
      networkFirst(
        req,
        // No cached payload: fail quietly. The optimistic UI + offline queue
        // already hold the truth; a 504 here is swallowed by the app.
        () => new Response("", { status: 504 })
      )
    );
    return;
  }

  // Page navigations:
  //  - /driver: network-first, and guaranteed to end on something usable.
  //  - everything else (dispatch / sales / settings): straight to the network
  //    so a new deploy is picked up immediately and no page gets trapped on a
  //    stale shell. Office use is online-only.
  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/driver")) {
      e.respondWith(networkFirst(req, offlineResponse));
    }
  }
});
