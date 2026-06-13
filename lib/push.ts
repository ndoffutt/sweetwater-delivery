import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@sweetwaterscleaners.com";

export function pushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

let ready = false;
function ensureConfigured() {
  if (ready) return;
  if (!pushConfigured()) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
  ready = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a notification to every saved subscription. Prunes subscriptions the
 * push service reports as gone (404/410). Returns counts. No-op (sent: 0) when
 * push isn't configured or the table doesn't exist yet.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!pushConfigured()) return { sent: 0, pruned: 0 };
  ensureConfigured();

  const supabase = createAdminClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error || !subs?.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    })
  );

  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("id", dead);
  }
  return { sent, pruned: dead.length };
}
