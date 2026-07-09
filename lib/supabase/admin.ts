import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      global: {
        // Next.js may cache same-URL GETs made inside route handlers (Data
        // Cache), which serves stale rows to polling endpoints like /api/live.
        // Always hit Supabase directly.
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
    }
  );
}
