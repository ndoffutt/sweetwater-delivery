# Sweetwater staging

Auto-deployed to https://sweetwater-delivery-staging.vercel.app on every push to `staging`.

- Backed by a **separate Supabase project** (no prod data touched)
- Integration keys (Resend / Anthropic / CRON_SECRET / webhook) are **intentionally unset**
- Promote tested work: `git checkout main && git merge staging && git push origin main`
