// Assemble staging/bootstrap.sql for sweetwater-delivery.
//
// Starts with the repo's dev_bootstrap.sql (the foundation), then layers on
// the newer files that landed AFTER dev_bootstrap was last updated. Adds a
// self-reset header + creates the `manifests` storage bucket (which the app
// uses but dev_bootstrap never creates).
//
// Pure schema-only — strips data DML so the bootstrap is safe to re-run, and
// data lands separately via staging/seed-staging.mjs.
//
// Run: node staging/build-bootstrap.mjs   (writes staging/bootstrap.sql)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Order matters — later files can override earlier ones (e.g. prospects.sql
// drops + recreates the prospects table that dev_bootstrap defines).
const FILES = [
  "supabase/dev_bootstrap.sql",
  "supabase/push_subscriptions.sql",
  "supabase/prospects.sql",
  "supabase/prospect_priority.sql",
  "supabase/prospect_town.sql",
  "supabase/route_prospect_visits.sql",
  "supabase/delivery_day.sql",
  "supabase/delivery_days.sql",
  "supabase/messaging.sql",
  "supabase/signups.sql",
];

const HEADER = `-- ============================================================================
-- SWEETWATER STAGING BOOTSTRAP — paste into the STAGING Supabase SQL Editor.
-- Self-resetting + schema-only. Data is loaded separately by seed-staging.mjs.
-- Assembled by staging/build-bootstrap.mjs.
-- ============================================================================
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;

-- Storage lives in the 'storage' schema (not reset above) — clear any
-- conflicting policies a prior run created, then ensure both buckets exist.
do $$ begin
  for r in (select policyname from pg_policies where schemaname='storage' and tablename='objects')
  loop execute format('drop policy if exists %I on storage.objects', r.policyname); end loop;
end $$;
insert into storage.buckets (id, name, public) values ('stop-photos', 'stop-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('manifests',   'manifests',   false) on conflict (id) do nothing;
`;

// Strip top-level data DML, preserving $$-quoted function bodies.
function stripData(sql) {
  const lines = sql.split("\n");
  const out = [];
  let inDollar = false;
  let skipping = false;
  const DML = /^\s*(insert|update|delete|copy|truncate)\b/i;
  for (const line of lines) {
    const dollars = (line.match(/\$\$/g) || []).length;
    if (inDollar) {
      out.push(line);
      if (dollars % 2 === 1) inDollar = false;
      continue;
    }
    if (skipping) {
      if (/;\s*(--.*)?$/.test(line)) skipping = false;
      continue;
    }
    if (DML.test(line)) {
      // Keep harmless storage.buckets seeds (they're idempotent + needed)
      if (/storage\.buckets/i.test(line)) { out.push(line); continue; }
      if (!/;\s*(--.*)?$/.test(line)) skipping = true;
      continue;
    }
    out.push(line);
    if (dollars % 2 === 1) inDollar = true;
  }
  return out.join("\n");
}

let body = "";
for (const f of FILES) {
  body += `\n\n-- ===== ${f} =====\n` + readFileSync(f, "utf8");
}

mkdirSync("staging", { recursive: true });
writeFileSync("staging/bootstrap.sql", HEADER + stripData(body) + "\n");
console.log("wrote staging/bootstrap.sql");
