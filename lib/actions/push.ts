"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const missingTable = (msg: string | undefined) =>
  !!msg && /push_subscriptions/i.test(msg) && /(does not exist|find the table|schema cache)/i.test(msg);

export async function savePushSubscription(sub: BrowserSubscription, userAgent?: string) {
  const session = await requireSession();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: session.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    if (missingTable(error.message)) {
      return { error: "Run supabase/push_subscriptions.sql first" };
    }
    return { error: error.message };
  }
  return { success: true };
}

export async function deletePushSubscription(endpoint: string) {
  await requireSession();
  const supabase = createAdminClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error && !missingTable(error.message)) return { error: error.message };
  return { success: true };
}
