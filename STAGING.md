# Environments — Staging & Production

This repo deploys to **two** parallel environments. Same code, different
backends. Test on staging, promote to prod.

| | URL | Branch | Supabase ref | Auto-deploys on |
|---|---|---|---|---|
| **Production** | https://sweetwater-delivery.vercel.app | `main` | `zcykmptrwehecuiipmgk` | push to `main` |
| **Staging** | https://sweetwater-delivery-staging.vercel.app | `staging` | `mpqggqnocmobwsmmputd` | push to `staging` |

Both Vercel projects are linked to the same GitHub repo
(`ndoffutt/sweetwater-delivery`); each tracks its own branch and uses its own
environment variables.

## How to make a change

```bash
# 1. Move to the staging branch
git checkout staging
git pull origin staging

# 2. Make your changes, commit
git add ...
git commit -m "..."

# 3. Push — auto-deploys to staging URL
git push origin staging

# 4. Test on https://sweetwater-delivery-staging.vercel.app
#    Real test users, real-shaped data, but nobody real is affected.

# 5. When it's good, promote to prod
git checkout main
git merge staging
git push origin main
# → auto-deploys to https://sweetwater-delivery.vercel.app
```

> **Always start on `staging`.** Pushing directly to `main` deploys to prod
> immediately, with no test step.

## What's isolated between the two

**Database.** Different Supabase projects entirely. Nothing you write in
staging can reach prod's tables.

**Driver push notifications.** Staging has zero VAPID keys set and zero
push subscriptions in its DB — so even if dispatch code tries to ring a
driver's phone, the send fails silently. Drivers' phones are subscribed to
prod's URL, not staging's.

**Email.** Staging has no `RESEND_API_KEY`. Code that tries to send email
errors loud, doesn't fall back to anything.

**AI manifest scan.** Staging has no `ANTHROPIC_API_KEY`. Manifest OCR
fails — feature shows an error, no API call made.

**Cron jobs.** Staging has no `CRON_SECRET`. Vercel still fires the cron
on staging's URL, but the endpoint returns 401 immediately.

**Public signup webhook.** Staging has no `SIGNUP_WEBHOOK_SECRET` — webhook
returns 401.

## What's *shared* (worth knowing)

**Mapbox token.** Both environments use the same Mapbox token because it's
a read-only usage cost (drives map tiles, doesn't change anything). The
free tier is generous; staging testing won't exhaust it.

**GitHub repo.** Same source code. The only branching is at deploy time
(branch → project).

## ⚠️ Known small leakage — `APP_URL` fallback

Two files fall back to the **production URL** when `APP_URL` isn't set in
the environment:

- `lib/messaging.ts:104` — Twilio status callback URL
- `lib/track.ts:26` — customer tracking link generation

If staging triggers either path, the URL stamped into the message will
point at the prod app. The customer would hit prod and see "tracking not
found" because the token only exists in staging's DB — annoying but not
dangerous (no prod data altered).

To plug this, set `APP_URL=https://sweetwater-delivery-staging.vercel.app`
as a Production-scope env var on the **staging** Vercel project. Then both
files use the staging URL when running there.

## Refreshing staging data

Staging was seeded with a snapshot of prod (users, customers, prospects,
routes, route_stops, etc.). It drifts over time as prod accumulates new
records or you mutate things in staging. To re-snapshot from current prod:

```bash
node staging/seed-staging.mjs --apply
```

The script reads prod creds from `~/.sweetwater/prod.env` and staging creds
from `~/.sweetwater/staging.env` (both hold `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SECRET_KEY`). It's idempotent (uses upsert) and self-adapting
(drops columns staging doesn't have, in case of schema drift).
`push_subscriptions` is intentionally excluded — prod browser endpoints
can't ring drivers' phones from staging anyway, and copying them risks
confusion.

> The earlier `/tmp/sw-prod.env` / `/tmp/sw-staging.env` paths are gone.
> `/tmp` doesn't survive reboots — `~/.sweetwater/` persists across
> sessions. See `CLAUDE.md` "Credentials" section for the file layout +
> Node parsing snippet.

### Wiping staging back to bootstrap

If staging gets too crufty, re-paste `staging/bootstrap.sql` into the
Sweetwater staging Supabase SQL editor. The first line is
`drop schema if exists public cascade` so it wipes itself clean and
rebuilds from scratch. Then re-run the seed.

## Operations cheat sheet

| Task | Command |
|---|---|
| Check what's deployed where | `vercel ls sweetwater-delivery` / `vercel ls sweetwater-delivery-staging` |
| See staging build logs | `vercel logs sweetwater-delivery-staging` |
| See prod build logs | `vercel logs sweetwater-delivery` |
| Read staging keys | `cat ~/.sweetwater/staging.env` (Supabase URL + publishable + secret) |
| Read prod keys (diagnostics only) | `cat ~/.sweetwater/prod.env` |
| Roll back staging | `git revert` on the `staging` branch + push |
| Roll back prod | `git revert` on `main` + push, OR Vercel dashboard "Promote previous deployment" |

## Tooling for the staging setup itself

These files live in `staging/`:

| File | Purpose |
|---|---|
| `staging/build-bootstrap.mjs` | Concatenates `supabase/*.sql` into a single dependency-ordered, self-resetting schema file. Run with `node staging/build-bootstrap.mjs`. |
| `staging/bootstrap.sql` | The assembled schema. Paste once into the Sweetwater staging Supabase SQL editor. |
| `staging/seed-staging.mjs` | REST-based prod-to-staging data copier. See "Refreshing staging data" above. |

`scripts/clone-prod-to-staging.sh` is an alternative pg_dump-based clone
(requires libpq installed locally + DB passwords) — kept around for the
day you want the cleanest possible mirror.
