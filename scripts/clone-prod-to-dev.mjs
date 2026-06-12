// Clone production data into the DEV Supabase project so dev mirrors reality.
// Run AFTER dev_bootstrap.sql has been run in the dev project's SQL editor:
//
//   node --env-file=.env.prod.local --env-file=.env.local scripts/clone-prod-to-dev.mjs
//
// Reads prod from PROD_SUPABASE_URL / PROD_SUPABASE_KEY (set in .env.prod.local)
// and writes to NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (the DEV values
// in .env.local). Copies: customers, signups, prospects+touchpoints, the 6 most
// recent routes with their stops, and recent messages. Also creates the
// storage buckets. Photos/blobs are NOT copied (dev doesn't need them).

const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_KEY = process.env.PROD_SUPABASE_KEY;
const DEV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const DEV_KEY = process.env.SUPABASE_SECRET_KEY;

if (!PROD_URL || !PROD_KEY || !DEV_URL || !DEV_KEY) {
  console.error("Missing env. Need PROD_SUPABASE_URL/PROD_SUPABASE_KEY (.env.prod.local) and NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY (.env.local, dev values).");
  process.exit(1);
}
if (PROD_URL === DEV_URL) {
  console.error("Refusing to run: prod and dev URLs are identical.");
  process.exit(1);
}

const h = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal,resolution=ignore-duplicates" });
const fromProd = (q) => fetch(`${PROD_URL}/rest/v1/${q}`, { headers: h(PROD_KEY) }).then((r) => r.json());
async function toDev(table, rows) {
  if (!rows.length) return console.log(`  ${table}: nothing to copy`);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const res = await fetch(`${DEV_URL}/rest/v1/${table}`, { method: "POST", headers: h(DEV_KEY), body: JSON.stringify(chunk) });
    if (!res.ok) { console.error(`  ${table}: FAILED -> ${res.status} ${await res.text()}`); return; }
  }
  console.log(`  ${table}: ${rows.length} rows`);
}

console.log("Copying prod -> dev…");

// Buckets (idempotent).
for (const [id, isPublic] of [["stop-photos", true], ["manifests", false]]) {
  const res = await fetch(`${DEV_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: h(DEV_KEY),
    body: JSON.stringify({ id, name: id, public: isPublic }),
  });
  console.log(`  bucket ${id}: ${res.ok ? "created" : "exists"}`);
}

// Reference data, ids preserved so FKs line up.
await toDev("customers", await fromProd("customers?select=*&order=created_at"));
await toDev("customer_signups", await fromProd("customer_signups?select=*"));
await toDev("prospects", await fromProd("prospects?select=*").then((r) => (Array.isArray(r) ? r : [])));
await toDev("prospect_touchpoints", await fromProd("prospect_touchpoints?select=*").then((r) => (Array.isArray(r) ? r : [])));

// Routes need a driver id that exists in dev; remap to the dev seed driver.
const prodRoutes = await fromProd("routes?select=*&deleted_at=is.null&order=date.desc&limit=6");
const devUsers = await fetch(`${DEV_URL}/rest/v1/users?select=id,role`, { headers: h(DEV_KEY) }).then((r) => r.json());
const devDriver = devUsers.find((u) => u.role === "driver");
await toDev("routes", prodRoutes.map((r) => ({ ...r, driver_id: devDriver.id })));
const routeIds = prodRoutes.map((r) => r.id);
if (routeIds.length) {
  const stops = await fromProd(`route_stops?select=*&route_id=in.(${routeIds.join(",")})`);
  await toDev("route_stops", stops);
}

// Recent messages (if the prod messaging migration has run).
const msgs = await fromProd("messages?select=*&order=created_at.desc&limit=200");
if (Array.isArray(msgs)) await toDev("messages", msgs.map((m) => ({ ...m, stop_id: null })));

console.log("Done. Dev now mirrors prod (minus photos).");
