#!/usr/bin/env bash
# Clone production Supabase → staging Supabase via pg_dump.
# Captures the EXACT live schema (so dashboard-added columns come along), then
# loads all data. Idempotent-ish: re-running drops + recreates the public
# schema in staging before loading, so it's safe to repeat.
#
# Usage:
#   scripts/clone-prod-to-staging.sh
#
# Requires: pg_dump + psql installed (brew install libpq && brew link --force libpq).
#
# You'll be prompted for the two database URIs (Supabase → Settings →
# Database → Connection string → URI, Session mode). They look like:
#   postgresql://postgres.<ref>:<password>@aws-X-region.pooler.supabase.com:5432/postgres
#
# Set DRY_RUN=1 to dump but NOT apply (so you can inspect /tmp/sw-*.sql first).

set -euo pipefail

# --- prerequisites -----------------------------------------------------------
command -v pg_dump >/dev/null || { echo "✗ pg_dump not found. brew install libpq && brew link --force libpq"; exit 1; }
command -v psql >/dev/null    || { echo "✗ psql not found. brew install libpq && brew link --force libpq"; exit 1; }

# --- inputs ------------------------------------------------------------------
read -p "PROD database URI: " PROD_DB
[[ "$PROD_DB" == postgresql://* ]] || { echo "✗ that doesn't look like a postgres URI"; exit 1; }

read -p "STAGING database URI: " STG_DB
[[ "$STG_DB" == postgresql://* ]] || { echo "✗ that doesn't look like a postgres URI"; exit 1; }

# Safety: refuse to apply changes if the staging URI happens to match prod.
[[ "$PROD_DB" == "$STG_DB" ]] && { echo "✗ PROD and STAGING URIs are identical — refusing"; exit 1; }

echo
echo "→ dumping prod schema (no data)..."
pg_dump "$PROD_DB" --schema-only --no-owner --no-privileges --schema=public --schema=storage \
  --no-comments \
  -f /tmp/sw-schema.sql

echo "→ dumping prod data (excluding push_subscriptions — prod browser endpoints)..."
pg_dump "$PROD_DB" --data-only --no-owner --schema=public \
  --exclude-table-data='public.push_subscriptions' \
  -f /tmp/sw-data.sql

# Wrap data with trigger-disable so audit/etc. don't fire during bulk load.
{
  echo "SET session_replication_role = replica;"
  cat /tmp/sw-data.sql
  echo "SET session_replication_role = DEFAULT;"
} > /tmp/sw-data-quiet.sql

echo "  schema: $(wc -l < /tmp/sw-schema.sql) lines"
echo "  data:   $(wc -l < /tmp/sw-data.sql) lines"

if [[ "${DRY_RUN:-0}" = "1" ]]; then
  echo "DRY_RUN=1 — wrote /tmp/sw-schema.sql + /tmp/sw-data-quiet.sql; not applying"
  exit 0
fi

echo
echo "→ resetting staging public schema (drop + recreate)..."
psql "$STG_DB" -v ON_ERROR_STOP=1 -c "drop schema if exists public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to anon, authenticated, service_role;"

echo "→ applying schema to staging..."
psql "$STG_DB" -v ON_ERROR_STOP=1 -f /tmp/sw-schema.sql 2>&1 | tail -8

echo "→ applying data to staging..."
psql "$STG_DB" -v ON_ERROR_STOP=1 -f /tmp/sw-data-quiet.sql 2>&1 | tail -8

echo
echo "✓ done. Verify a row count at https://supabase.com → staging project → Table Editor."
