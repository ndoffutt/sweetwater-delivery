/**
 * Seed richer test data for hands-on testing.
 *
 * Run with env loaded:
 *   set -a && . ./.env.local && set +a && node scripts/seed-test-data.mjs
 *
 * Uses the PostgREST API directly (no supabase-js, to avoid the Node 20
 * websocket dependency). Idempotent: customers added only if missing by name,
 * today's route reset in place, recent past routes rebuilt.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function rest(method, path, body, prefer) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const get = (path) => rest("GET", path);
const insert = (table, rows) => rest("POST", table, rows, "return=representation");
const patch = (path, body) => rest("PATCH", path, body);
const del = (path) => rest("DELETE", path);

// text_messages.stop_id has no cascade, so clear any rows referencing a
// route's stops before deleting those stops.
async function clearStopRefs(routeId) {
  const stops = await get(`route_stops?select=id&route_id=eq.${routeId}`);
  if (stops.length) {
    const ids = stops.map((s) => s.id).join(",");
    await del(`text_messages?stop_id=in.(${ids})`);
  }
}

function dateStr(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

const NEW_CUSTOMERS = [
  { name: "The Vanderbilt Estate", address: "12 Lily Pond Ln, East Hampton, NY 11937", phone: "631-555-0110", gate_code: "7788", delivery_notes: "Ring bell at main gate, staff will meet you" },
  { name: "Harrington Cottage", address: "45 Further Ln, East Hampton, NY 11937", phone: "631-555-0111", gate_code: null, delivery_notes: "Leave at front door, no signature needed" },
  { name: "Blackwood Manor", address: "88 Meadow Ln, Southampton, NY 11968", phone: "631-555-0112", gate_code: "2024", delivery_notes: "Use west service gate. Two large dogs — friendly." },
  { name: "Sutton Beach House", address: "301 Dune Rd, Bridgehampton, NY 11932", phone: "631-555-0113", gate_code: null, delivery_notes: null },
  { name: "Ellison Residence", address: "7 Egypt Ln, Amagansett, NY 11930", phone: "631-555-0114", gate_code: "5500#", delivery_notes: "Items go in the pool house, not the main house" },
  { name: "Caldwell Family", address: "156 Main St, Sag Harbor, NY 11963", phone: "631-555-0115", gate_code: null, delivery_notes: "Apartment 2B above the gallery — buzz 2B" },
  { name: "Montauk Point Rental", address: "99 Old Montauk Hwy, Montauk, NY 11954", phone: "631-555-0116", gate_code: "1990", delivery_notes: "Steep driveway — park at top and walk down" },
  { name: "Whitfield Estate", address: "22 Halsey Ln, Water Mill, NY 11976", phone: "631-555-0117", gate_code: "4040", delivery_notes: "Housekeeper Maria receives at side entrance" },
];

async function main() {
  // Driver to assign routes to.
  const drivers = await get("users?select=id&role=eq.driver&deleted_at=is.null&order=created_at.asc&limit=1");
  if (!drivers.length) throw new Error("No driver found");
  const driverId = drivers[0].id;

  // 1) Ensure the new customers exist (by name).
  const existing = await get("customers?select=name&deleted_at=is.null");
  const have = new Set(existing.map((c) => c.name));
  const toAdd = NEW_CUSTOMERS.filter((c) => !have.has(c.name));
  if (toAdd.length) await insert("customers", toAdd);
  console.log(`Customers: ${toAdd.length} added, ${have.size} already present`);

  const customers = await get("customers?select=id,name&active=eq.true&deleted_at=is.null");
  const id = Object.fromEntries(customers.map((c) => [c.name, c.id]));
  const pick = (name) => {
    if (!id[name]) throw new Error("Missing customer: " + name);
    return id[name];
  };

  // 2) Reset TODAY's route to a fresh, fully-pending dispatched route.
  const today = dateStr(0);
  const existingToday = await get(`routes?select=id&date=eq.${today}&deleted_at=is.null`);
  let routeId;
  if (existingToday.length) {
    routeId = existingToday[0].id;
    await clearStopRefs(routeId);
    await del(`route_stops?route_id=eq.${routeId}`);
    await patch(`routes?id=eq.${routeId}`, { status: "dispatched", started_at: null, completed_at: null });
  } else {
    const created = await insert("routes", { date: today, driver_id: driverId, status: "dispatched" });
    routeId = created[0].id;
  }

  const todayStops = [
    { name: "The Vanderbilt Estate", has_dropoff: true, has_pickup: true },
    { name: "Harrington Cottage", has_dropoff: true, has_pickup: false },
    { name: "Blackwood Manor", has_dropoff: true, has_pickup: false },
    { name: "Ellison Residence", has_dropoff: true, has_pickup: true },
    { name: "Caldwell Family", has_dropoff: false, has_pickup: true },
    { name: "Whitfield Estate", has_dropoff: true, has_pickup: false },
  ];
  await insert(
    "route_stops",
    todayStops.map((s, i) => ({
      route_id: routeId,
      customer_id: pick(s.name),
      stop_order: i + 1,
      status: "pending",
      has_dropoff: s.has_dropoff,
      has_pickup: s.has_pickup,
    }))
  );
  console.log(`Today's route (${today}): reset to dispatched with ${todayStops.length} pending stops`);

  // 3) Rebuild a few completed PAST routes for the Recent Routes list.
  const history = [
    { offset: -1, stops: ["Johnson Residence", "Smith Estate", "Chen Family", "Davis Cottage"] },
    { offset: -2, stops: ["Williams House", "Peterson Home", "Sutton Beach House", "Montauk Point Rental", "Caldwell Family"] },
    { offset: -3, stops: ["The Vanderbilt Estate", "Whitfield Estate", "Ellison Residence"] },
  ];
  for (const h of history) {
    const d = dateStr(h.offset);
    const old = await get(`routes?select=id&date=eq.${d}`);
    for (const r of old) {
      await clearStopRefs(r.id);
      await del(`driver_locations?route_id=eq.${r.id}`);
      await del(`routes?id=eq.${r.id}`); // stops cascade
    }
    const created = await insert("routes", {
      date: d, driver_id: driverId, status: "completed",
      started_at: `${d}T13:00:00Z`, completed_at: `${d}T17:30:00Z`,
    });
    const rId = created[0].id;
    await insert(
      "route_stops",
      h.stops.map((name, i) => ({
        route_id: rId,
        customer_id: pick(name),
        stop_order: i + 1,
        status: "completed",
        has_dropoff: true,
        has_pickup: i % 2 === 1,
        dropoff_confirmed: true,
        pickup_confirmed: i % 2 === 1,
        completed_at: `${d}T15:${String(10 + i).padStart(2, "0")}:00Z`,
      }))
    );
    console.log(`Past route (${d}): completed with ${h.stops.length} stops`);
  }

  console.log("\nDone. Manager PIN 0000 · Driver taps Start Driving.");
}

main().catch((e) => {
  console.error("Seed failed:", e.message || e);
  process.exit(1);
});
