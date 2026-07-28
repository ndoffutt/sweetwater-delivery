"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";

export interface ClientErrorInput {
  message: string;
  stack?: string | null;
  /** 'boundary:driver' | 'boundary:app' | 'boundary:root' | 'window.onerror' | 'unhandledrejection' */
  source: string;
  url?: string | null;
  digest?: string | null;
  userAgent?: string | null;
}

// Persist a crash/error the browser hit so we can actually SEE what took the
// app down in the field (previously we were blind - no boundaries, no logging).
// Deliberately best-effort and un-throwing: logging an error must never itself
// throw. If the client_errors table hasn't been created yet, this silently
// no-ops rather than surfacing a second error to the caller.
export async function logClientError(input: ClientErrorInput): Promise<void> {
  try {
    const session = await getSession().catch(() => null);
    const supabase = createAdminClient();
    await supabase.from("client_errors").insert({
      message: (input.message || "Unknown error").slice(0, 2000),
      stack: input.stack ? input.stack.slice(0, 6000) : null,
      source: (input.source || "unknown").slice(0, 64),
      url: input.url ? input.url.slice(0, 500) : null,
      digest: input.digest ? input.digest.slice(0, 200) : null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
      user_name: session?.name ?? null,
    });
  } catch {
    // Table missing / offline / anything: swallow. Never let logging crash.
  }
}
