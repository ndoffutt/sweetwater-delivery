// Copy prod Supabase data → staging Supabase via REST.
//
// Reads creds from ~/.sweetwater/prod.env and ~/.sweetwater/staging.env.
// Both files hold NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. Run
// AFTER bootstrap.sql.
//
//   node staging/seed-staging.mjs              # dry-run (counts only)
//   node staging/seed-staging.mjs --apply      # actually copy

import { readFileSync } from "node:fs";
import os from "node:os";

const parseEnv = (p) =>
  Object.fromEntries(
    readFileSync(p, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      v = v.replace(/\\n$/, "").trim();
      return [l.slice(0, i).trim(), v];
    })
  );

const PROD_PATH = `${os.homedir()}/.sweetwater/prod.env`;
const STG_PATH = `${os.homedir()}/.sweetwater/staging.env`;

let PROD_URL, PROD_KEY;
try {
  const prod = parseEnv(PROD_PATH);
  PROD_URL = prod.NEXT_PUBLIC_SUPABASE_URL;
  PROD_KEY = prod.SUPABASE_SECRET_KEY || prod.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
} catch {}
if (!PROD_URL || !PROD_KEY) {
  console.error(`✗ Couldn't read prod creds from ${PROD_PATH}. Vercel marks Supabase keys sensitive — pull them from the prod Supabase dashboard (Settings → API) and paste into ${PROD_PATH}.`);
  process.exit(1);
}

const stg = parseEnv(STG_PATH);
const STG_URL = stg.NEXT_PUBLIC_SUPABASE_URL;
const STG_KEY = stg.SUPABASE_SECRET_KEY || stg.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!STG_URL || !STG_KEY) {
  console.error(`✗ ${STG_PATH} missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY`);
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// FK-safe load order. push_subscriptions is intentionally skipped — prod
// browser endpoints have no meaning in staging.
const TABLES = [
  "users",
  "customers",
  "prospects",
  "prospect_touchpoints",
  "routes",
  "route_stops",
  "route_prospect_visits",
  "stop_photos",
  "driver_locations",
  "manifest_scans",
  "messages",
  "text_messages",
  "customer_signups",
];

const readAll = async (table) => {
  const rows = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const r = await fetch(`${PROD_URL}/rest/v1/${table}?select=*&limit=${step}&offset=${from}&order=id`, {
      headers: { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` },
    });
    if (!r.ok) throw new Error(`read ${table}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    rows.push(...page);
    if (page.length < step) break;
    from += step;
  }
  return rows;
};

// Sample one staging row to learn its column set (drops cols prod has but
// staging doesn't — the classic schema-drift dance from MCG).
const stagingColumns = async (table) => {
  const r = await fetch(`${STG_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: STG_KEY, Authorization: `Bearer ${STG_KEY}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows.length > 0 ? new Set(Object.keys(rows[0])) : null;
};

const upsert = async (table, rows) => {
  let work = rows;
  const cols = await stagingColumns(table);
  if (cols) work = work.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => cols.has(k))));

  const drop = (col) => { work = work.map((r) => { const { [col]: _, ...rest } = r; void _; return rest; }); };
  const dropped = [];

  for (let i = 0; i < work.length; ) {
    const batch = work.slice(i, i + 500);
    const r = await fetch(`${STG_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: STG_KEY, Authorization: `Bearer ${STG_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (r.ok) { i += 500; continue; }
    const body = await r.text();
    const m = body.match(/Could not find the '([^']+)' column/);
    if (m) { drop(m[1]); dropped.push(m[1]); continue; }
    throw new Error(`write ${table}: ${r.status} ${body}`);
  }
  return dropped;
};

for (const t of TABLES) {
  try {
    const rows = await readAll(t);
    if (!APPLY) { console.log(`${t}: ${rows.length} rows (dry-run)`); continue; }
    const dropped = await upsert(t, rows);
    console.log(`${t}: copied ${rows.length}${dropped?.length ? ` (dropped cols not in staging: ${dropped.join(", ")})` : ""}`);
  } catch (e) {
    console.error(`✗ ${t}: ${e.message}`);
  }
}
console.log(APPLY ? "\n✓ seed complete" : "\n(dry-run — re-run with --apply)");
