# Sweetwater's Operations App

The operational app for Sweetwater's Cleaners (Wainscott & Hampton Bays):
delivery dispatch + driver app, customer directory, two-way SMS from the office
number, and sales/prospects. Expanding beyond delivery into the company-wide
ops hub (modeled on the MCG app).

## Deploys
- **This app is in production.** Never `git push origin main` or trigger a
  Vercel prod deploy unless the user explicitly says "push", "deploy", "ship",
  etc. Pushing to the `staging` branch is fine — staging is for testing.
- Local commits are always fine (reversible).

## Environments — staging is the default for ALL testing

| | Production | Staging |
|---|---|---|
| URL | https://sweetwater-delivery.vercel.app | https://sweetwater-delivery-staging.vercel.app |
| Git branch | `main` | `staging` |
| Vercel project | `sweetwater-delivery` | `sweetwater-delivery-staging` |
| Supabase project | `zcykmptrwehecuiipmgk` | `mpqggqnocmobwsmmputd` |
| Use for | real customers + drivers | **all Claude-driven testing** |

**Always test against staging first.** The staging Supabase is a clone of prod,
disposable, and refreshable via `node staging/seed-staging.mjs --apply`. The
user has explicitly said they don't care about staging data being updated —
write whatever you need to verify a change. The only rule: **don't touch prod**.

### Staging is isolated from prod side effects

Staging Vercel project has ONLY these env vars set: `SUPABASE_*`, `EMAIL_FROM`,
`MAPBOX_TOKEN`. Everything else is intentionally missing, so:
- ❌ No SMS — no `TWILIO_*` creds, send call throws
- ❌ No email — no `RESEND_API_KEY`, send call returns 500
- ❌ No push — no `VAPID_*`, `web-push` throws "VAPID keys not configured"
- ❌ No AI calls — no `ANTHROPIC_API_KEY`, manifest extract throws on init
- ❌ No crons — no `CRON_SECRET`, schedule fires but auth fails

You can do anything on staging — bulk inserts, mass deletes, scripted writes —
without reaching a real customer.

### Implementing changes — the workflow

For app changes (UI, routes, components, server actions):
1. Branch from `staging` (or work on it directly — `main` is for promotion only).
2. `npm run dev` runs against whichever Supabase `.env.local` points at.
   **`.env.local` currently points at PROD.** Do NOT use it for write tests.
   For dev-server testing of write paths, temporarily swap `.env.local` to
   staging (snippet below) or test via the live staging URL.
3. Push to `staging` branch → Vercel auto-deploys to
   sweetwater-delivery-staging.vercel.app. Verify there.
4. Only after the user says "push" / "ship" / "deploy": merge into `main` and
   push. That triggers the prod deploy.

For schema changes:
1. Write the SQL.
2. Apply it to staging Supabase SQL editor first; verify via REST + UI.
3. Append to `supabase/migration.sql` (the canonical schema doc).
4. When the user is ready, they paste the same SQL into the prod SQL editor.

For one-off scripts (data audits, backfills, smoke tests):
- ALWAYS read `~/.sweetwater/staging.env`. Never use `.env.local` or
  `~/.sweetwater/prod.env` for writes.
- Save to `/tmp/sw-<topic>.mjs`. Run with `node /tmp/sw-<topic>.mjs`.

Quick swap of `.env.local` to staging for a dev-server test (and restore):

```bash
cp .env.local /tmp/sw-env-local-backup
# swap URL + keys to staging values from ~/.sweetwater/staging.env
# ...run dev server, test...
cp /tmp/sw-env-local-backup .env.local   # restore
```

See `STAGING.md` (in this repo) for the full human-readable doc on the
environment split, including isolation guarantees, refresh workflow, and the
one known leakage (`APP_URL` fallback in `lib/messaging.ts:104` and
`lib/track.ts:26`).

## Credentials — `~/.sweetwater/` (NOT in repo)

Supabase keys for both environments live outside the repo in `~/.sweetwater/`.
This directory persists across Claude sessions (unlike `/tmp/`, which is
per-session ephemeral) and stays out of git.

```
~/.sweetwater/
├── staging.env     — staging Supabase URL + publishable + secret keys
├── prod.env        — production keys (optional; read-only diagnostics)
└── README.md       — parsing/usage notes
```

**Parsing in Node** (don't `source` — values may contain stray `\n`):

```js
import fs from "node:fs";
import os from "node:os";
const env = Object.fromEntries(
  fs.readFileSync(os.homedir() + "/.sweetwater/staging.env", "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v.replace(/\\n/g, "").trim()];
    })
);
// env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY
```

**Reach Supabase via PostgREST + fetch** (skip `@supabase/supabase-js` for
one-offs — its realtime client requires `ws` on Node 20):

```js
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const r = await fetch(URL + "/rest/v1/customers?select=id,name", { headers });
```

**Pagination** — PostgREST caps at 1000 rows by default. For larger tables:

```js
let from = 0, out = [];
while (true) {
  const r = await fetch(URL + "/rest/v1/customers?select=id,name", {
    headers: { ...headers, Range: `${from}-${from + 999}` },
  });
  const chunk = await r.json();
  out.push(...chunk);
  if (chunk.length < 1000) break;
  from += 1000;
}
```

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS (green/gold/cream brand palette)
- Supabase (Postgres + Storage + Realtime)
- PWA (standalone, portrait)

## Dev commands
```bash
npm run dev    # start dev server on :3000
npm run build  # production build
npm run lint   # eslint
```

## Conventions
- NEVER run `npm run build` while the dev server is running — they share
  `.next/` and the build corrupts the dev server's chunks (missing-module 500s,
  unstyled pages, dead hydration). Stop dev, build, `rm -rf .next`, restart dev.
- Verify every change in browser before reporting done.
- Large tap targets: `min-h-tap` / `min-w-tap` (44px) on all interactive
  elements — drivers use this app outdoors on phones.
- Optimistic UI for state mutations (update local state before server confirms).
- Photo uploads: compress client-side with `createImageBitmap` before uploading.
- Soft-deletes: `deleted_at` column, never hard delete user-facing data.
- Audit triggers: SECURITY DEFINER for soft-delete triggers.
- Never push or deploy to prod without explicit user approval.

## Auth
- No email/password. Driver taps "Start Driving" (no PIN); staff use a PIN at
  "Staff Login" — the PIN decides the account: Manager (role `dispatcher`,
  PIN 0000) or Owner (role `admin`, PIN 2968).
- Roles: driver < dispatcher (Manager) < admin (Owner). Owner lands on `/owner`
  (Drive / Dispatch / Sales chooser); Sales (`/sales`, prospects B2B tracker)
  is admin-only. Manager nav is trimmed (no Messages/Prospects for now) — new
  features are tested in the owner view first.
- Salt: `sw-delivery-2026`
- Session: HMAC-signed cookie (`sw-session`), 60d sliding refresh.

## Key directories
- `lib/actions/` — server actions for mutations
- `lib/supabase/` — client, server, admin Supabase clients
- `components/` — shared UI components
- `app/driver/` — driver-facing pages
- `app/dispatch/` — dispatcher-facing pages
- `app/owner/` — owner home (Drive / Dispatch / Sales chooser)
- `app/sales/` — Sales section: B2B prospects (admin-only). "Commercial" is
  the umbrella; segments: prop_manager (top priority) / hotel / club /
  restaurant / retail / other. Statuses: new → working → active (popup
  captures services bought: employees/linen/referral) | on_hold | dead.
  Seeded from HubSpot (`supabase/prospects.sql`); HubSpot is retired.
- `staging/` — staging environment tooling: `bootstrap.sql` (schema reset),
  `build-bootstrap.mjs` (assembler), `seed-staging.mjs` (REST-based prod→staging
  data copier; self-adapts to schema drift).
- `supabase/migration.sql` — database schema + seed data

## Sensitive env-var gotcha
Vercel marks `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
and `SUPABASE_SECRET_KEY` as "sensitive" — they come back blank from
`vercel env pull` AND from the Vercel REST API even with `decrypt=true`. That's
why this CLAUDE.md tells you to read from `~/.sweetwater/staging.env` instead.
Values copy in from the Supabase dashboard (Settings → API), not from Vercel.
