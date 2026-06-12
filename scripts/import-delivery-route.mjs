/**
 * Import the hand-built delivery_route.csv:
 *   - upsert each customer (match existing by phone digits or normalized name,
 *     fill in lat/lng; otherwise create), preserving any notes/gate codes
 *   - soft-delete the 14 seed placeholders
 *   - (re)build today's route in the CSV's stop_order, ready to drive
 *
 * Run: node scripts/import-delivery-route.mjs   (env loaded from .env.local)
 */
import fs from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("Missing Supabase env"); process.exit(1); }

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function rest(method, path, body, prefer) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method, headers: prefer ? { ...headers, Prefer: prefer } : headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const get = (p) => rest("GET", p);
const insert = (t, rows) => rest("POST", t, rows, "return=representation");
const patch = (p, b) => rest("PATCH", p, b);
const del = (p) => rest("DELETE", p);

function parseCsvLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const normName = (raw) => {
  const s = raw.trim();
  if (s.includes(",")) { const [last, ...rest] = s.split(","); return `${rest.join(",").trim()} ${last.trim()}`.trim(); }
  return s;
};
const digits = (p) => (p || "").replace(/\D/g, "");

const PLACEHOLDERS = [
  "Johnson Residence", "Smith Estate", "Williams House", "Chen Family", "Davis Cottage",
  "Peterson Home", "The Vanderbilt Estate", "Harrington Cottage", "Blackwood Manor",
  "Sutton Beach House", "Ellison Residence", "Caldwell Family", "Montauk Point Rental", "Whitfield Estate",
];

async function main() {
  const rows = fs.readFileSync(new URL("../delivery_route.csv", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(rows[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const data = rows.slice(1).map((l) => parseCsvLine(l)).map((c) => ({
    stop_order: parseInt(c[idx.stop_order], 10),
    name: normName(c[idx.name]),
    address: c[idx.full_address] || c[idx.address],
    phone: c[idx.phone] || null,
    lat: c[idx.latitude] ? parseFloat(c[idx.latitude]) : null,
    lng: c[idx.longitude] ? parseFloat(c[idx.longitude]) : null,
  }));

  // Driver to assign the route to.
  const drivers = await get("users?select=id&role=eq.driver&deleted_at=is.null&order=created_at.asc&limit=1");
  if (!drivers.length) throw new Error("No driver found");
  const driverId = drivers[0].id;

  // Existing customers for dedup.
  const existing = await get("customers?select=id,name,phone&deleted_at=is.null");
  const byPhone = new Map(existing.filter((c) => digits(c.phone)).map((c) => [digits(c.phone), c.id]));
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));

  let matched = 0, created = 0;
  const orderedCustomerIds = [];
  for (const r of data) {
    let id = byPhone.get(digits(r.phone)) || byName.get(r.name.trim().toLowerCase());
    if (id) {
      // Fill coords; don't clobber name/address/notes the user may have edited.
      await patch(`customers?id=eq.${id}`, { lat: r.lat, lng: r.lng, ...(r.phone ? { phone: r.phone } : {}) });
      matched++;
    } else {
      const ins = await insert("customers", { name: r.name, address: r.address, phone: r.phone, lat: r.lat, lng: r.lng });
      id = ins[0].id;
      byPhone.set(digits(r.phone), id);
      byName.set(r.name.trim().toLowerCase(), id);
      created++;
    }
    orderedCustomerIds.push({ stop_order: r.stop_order, customer_id: id });
  }
  console.log(`Customers: ${created} created, ${matched} matched/updated`);

  // Retire the seed placeholders (soft delete keeps FK refs intact).
  for (const name of PLACEHOLDERS) {
    await patch(`customers?name=eq.${encodeURIComponent(name)}&deleted_at=is.null`, { deleted_at: new Date().toISOString(), active: false });
  }
  console.log(`Retired ${PLACEHOLDERS.length} placeholders`);

  // Build today's route in the hand-built order, ready to drive.
  const today = new Date().toISOString().split("T")[0];
  const todayRoutes = await get(`routes?select=id&date=eq.${today}&deleted_at=is.null`);
  let routeId;
  if (todayRoutes.length) {
    routeId = todayRoutes[0].id;
    const old = await get(`route_stops?select=id&route_id=eq.${routeId}`);
    if (old.length) {
      await del(`text_messages?stop_id=in.(${old.map((s) => s.id).join(",")})`);
      await del(`route_stops?route_id=eq.${routeId}`);
    }
    await patch(`routes?id=eq.${routeId}`, { status: "dispatched", driver_id: driverId, started_at: null, completed_at: null });
  } else {
    const r = await insert("routes", { date: today, driver_id: driverId, status: "dispatched" });
    routeId = r[0].id;
  }

  await insert("route_stops", orderedCustomerIds.sort((a, b) => a.stop_order - b.stop_order).map((s) => ({
    route_id: routeId,
    customer_id: s.customer_id,
    stop_order: s.stop_order,
    status: "pending",
    has_dropoff: true,
    has_pickup: false,
  })));
  console.log(`Today's route (${today}): dispatched with ${orderedCustomerIds.length} stops in hand-built order`);
  console.log("Done.");
}

main().catch((e) => { console.error("Import failed:", e.message || e); process.exit(1); });
