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

const digits = (s: string | null) => (s || "").replace(/\D/g, "").slice(-10);

async function rest(path: string, init?: RequestInit) {
  const res = await fetch(`${U}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

const D = "/Users/nateoffutt/Downloads";
const JOBS = [
  ["2026-06-04", `${D}/Manifest_Thursday_06_04_26.csv`],
  ["2026-05-28", `${D}/Manifest_Thursday_05_28_26.csv`],
  ["2026-05-21", `${D}/Manifest_Thursday_05_21_26.csv`],
  ["2026-05-14", `${D}/Manifest_Thursday_05_14_26.csv`],
];

async function main() {
  const customers: { id: string; name: string; phone: string | null }[] = await rest(
    "customers?select=id,name,phone&deleted_at=is.null"
  );
  const byName = new Map(customers.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const byPhone = new Map<string, string>();
  for (const c of customers) {
    const p = digits(c.phone);
    if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, c.id);
  }

  for (const [date, file] of JOBS) {
    const route = (await rest(`routes?date=eq.${date}&select=id`))[0];
    if (!route) { console.log(date, "no route, skip"); continue; }
    const stops = parseManifestCsv(readFileSync(file, "utf8"));
    let updated = 0, totalPieces = 0;
    for (const s of stops) {
      const pieces = s.piece_count ?? 0;
      let cid = byName.get(s.customer_name.trim().toLowerCase());
      if (!cid) { const ph = digits(s.phone); if (ph.length === 10) cid = byPhone.get(ph); }
      if (!cid) continue;
      await rest(`route_stops?route_id=eq.${route.id}&customer_id=eq.${cid}`, {
        method: "PATCH",
        body: JSON.stringify({ piece_count: pieces }),
      });
      updated++;
      totalPieces += pieces;
    }
    console.log(`✓ ${date}: updated ${updated} stops, ${totalPieces} total pieces`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
