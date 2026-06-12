# Sweetwater's Operations App

The operational app for Sweetwater's Cleaners (Wainscott & Hampton Bays):
delivery dispatch + driver app, customer directory, two-way SMS from the office
number, and sales/prospects. Expanding beyond delivery into the company-wide
ops hub (modeled on the MCG app).

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
- NEVER run `npm run build` while the dev server is running - they share
  `.next/` and the build corrupts the dev server's chunks (missing-module 500s,
  unstyled pages, dead hydration). Stop dev, build, `rm -rf .next`, restart dev.
- Test-script rule: verify every change in browser before reporting done
- Large tap targets: min-h-tap / min-w-tap (44px) on all interactive elements
- Optimistic UI for state mutations (update local state before server confirms)
- Photo uploads: compress client-side with createImageBitmap before uploading
- Soft-deletes: deleted_at column, never hard delete user-facing data
- Audit triggers: SECURITY DEFINER for soft-delete triggers
- Never push or deploy without explicit user approval

## Environments
- PRODUCTION Supabase: env vars live in Vercel; local archive in `.env.prod.local`
  (gitignored) for maintenance scripts: `node --env-file=.env.prod.local …`
- DEV Supabase: `.env.local` points at the dev project; `npm run dev` always
  hits dev. Bootstrap a fresh dev DB with `supabase/dev_bootstrap.sql`, then
  `node --env-file=.env.prod.local --env-file=.env.local scripts/clone-prod-to-dev.mjs`
- Build new features against dev; prod migrations are the individual files in
  `supabase/` which the user runs manually in the prod SQL editor at release.

## Auth
- No email/password. Driver taps "Start Driving" (no PIN); staff use a PIN at
  "Staff Login" - the PIN decides the account: Manager (role `dispatcher`,
  PIN 0000) or Owner (role `admin`, PIN 2968).
- Roles: driver < dispatcher (Manager) < admin (Owner). Owner lands on /owner
  (Drive / Dispatch / Sales chooser); Sales (/sales, prospects B2B tracker) is
  admin-only. Manager nav is trimmed (no Messages/Prospects for now) — new
  features are tested in the owner view first.
- Salt: sw-delivery-2026
- Session: HMAC-signed cookie (sw-session), 60d sliding refresh.

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
  Seeded from HubSpot (supabase/prospects.sql); HubSpot is retired.
- `supabase/migration.sql` — database schema + seed data
