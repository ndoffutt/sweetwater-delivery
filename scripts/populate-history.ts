import { readFileSync } from "node:fs";
import { parseManifestCsv } from "../lib/manifest/csv";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SECRET_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

const DATE = process.argv[2] || "2026-06-04";
const MANIFEST = process.argv[3] || "/Users/nateoffutt/Downloads/Manifest_Thursday_06_04_26.csv";
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("usage: tsx populate-history.ts YYYY-MM-DD /path/to/manifest.csv"); process.exit(1); }

const digits = (s: string | null) => (s || "").replace(/\D/g, "").slice(-10);

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function main() {
  const stops = parseManifestCsv(readFileSync(MANIFEST, "utf8"));
  console.log("parsed", stops.length, "stops");

  // Skip if already populated.
  const existing = await rest(`routes?date=eq.${DATE}&select=id`);
  if (existing.length) {
    console.log("route for", DATE, "already exists, aborting.");
    return;
  }

  const customers: { id: string; name: string; phone: string | null }[] = await rest(
    "customers?select=id,name,phone&active=eq.true&deleted_at=is.null"
  );
  const byName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const byPhone = new Map<string, string>();
  for (const c of customers) {
    const p = digits(c.phone);
    if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, c.id);
  }

  const driver = (await rest("users?role=eq.driver&select=id&limit=1"))[0];
  if (!driver) throw new Error("no driver");

  // Resolve each stop -> customerId.
  const resolved: { customerId: string; stop: (typeof stops)[number] }[] = [];
  let created = 0;
  for (const s of stops) {
    let id = byName.get(s.customer_name.trim().toLowerCase());
    if (!id) {
      const ph = digits(s.phone);
      if (ph.length === 10) id = byPhone.get(ph);
    }
    if (!id) {
      const row = (await rest("customers", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ name: s.customer_name.trim(), address: s.address.trim(), phone: s.phone?.trim() || null }),
      }))[0];
      id = row.id;
      created++;
    }
    resolved.push({ customerId: id as string, stop: s });
  }
  console.log("matched, created", created, "new customers");

  // Create the completed route.
  const startUtc = new Date(`${DATE}T13:00:00Z`); // ~9am EDT
  const route = (await rest("routes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      date: DATE,
      driver_id: driver.id,
      status: "completed",
      started_at: startUtc.toISOString(),
      completed_at: new Date(startUtc.getTime() + resolved.length * 11 * 60000).toISOString(),
    }),
  }))[0];

  // Completed stops, spread ~11 min apart, completed ~7 min after arrival.
  const rows = resolved.map((r, i) => {
    const arrived = new Date(startUtc.getTime() + i * 11 * 60000);
    const done = new Date(arrived.getTime() + 7 * 60000);
    return {
      route_id: route.id,
      customer_id: r.customerId,
      stop_order: i + 1,
      status: "completed",
      has_dropoff: r.stop.has_dropoff,
      has_pickup: r.stop.has_pickup,
      dropoff_confirmed: r.stop.has_dropoff,
      pickup_confirmed: r.stop.has_pickup,
      notes: r.stop.notes,
      arrived_at: arrived.toISOString(),
      completed_at: done.toISOString(),
    };
  });
  await rest("route_stops", { method: "POST", body: JSON.stringify(rows) });

  console.log(`✓ populated ${DATE}: route ${route.id} with ${rows.length} completed stops`);
}

main().catch((e) => { console.error(e); process.exit(1); });
