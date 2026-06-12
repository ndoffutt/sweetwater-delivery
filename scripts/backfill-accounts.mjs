// Backfill customers.spot_account + account_type from delivery_route.csv.
// Match existing customers by phone digits. Run after the manager_console.sql migration.
import fs from "node:fs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const get = (p) => fetch(`${url}/rest/v1/${p}`, { headers: H }).then((r) => r.json());
const patch = (p, b) => fetch(`${url}/rest/v1/${p}`, { method: "PATCH", headers: H, body: JSON.stringify(b) });

function parseLine(line) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  out.push(cur); return out;
}
const digits = (p) => (p || "").replace(/\D/g, "");

const rows = fs.readFileSync(new URL("../delivery_route.csv", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.trim());
const head = parseLine(rows[0]); const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const customers = await get("customers?select=id,phone&deleted_at=is.null");
const byPhone = new Map(customers.filter((c) => digits(c.phone)).map((c) => [digits(c.phone), c.id]));

let n = 0;
for (const line of rows.slice(1)) {
  const c = parseLine(line);
  const id = byPhone.get(digits(c[ix.phone]));
  if (!id) continue;
  await patch(`customers?id=eq.${id}`, { spot_account: c[ix.customer_id] || null, account_type: c[ix.account_type] || null });
  n++;
}
console.log(`Backfilled spot_account/account_type on ${n} customers`);
