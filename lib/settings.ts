// Runtime switches read from the database so they take effect immediately,
// without a redeploy. See supabase/app_settings.sql.
//
// Fail-closed on purpose: if the table is missing or the read throws, nothing
// falls back to "on" — an outage must not start texting customers. The env
// vars remain as an override for the same reason, so there's a way to force
// the whole thing off that doesn't depend on the database being reachable.
import { createAdminClient } from "@/lib/supabase/admin";

export interface MessagingSettings {
  autoTextsOn: boolean;
  /** While set, automated texts go here instead of to customers. */
  testTo: string;
}

async function readSettings(): Promise<Record<string, string | null>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("app_settings").select("key, value");
    if (error) return {};
    return Object.fromEntries(((data ?? []) as { key: string; value: string | null }[]).map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

export async function getMessagingSettings(): Promise<MessagingSettings> {
  // AUTO_TEXTS=0 is a hard kill that outranks whatever the database says.
  if (process.env.AUTO_TEXTS === "0") return { autoTextsOn: false, testTo: "" };

  const s = await readSettings();
  const stored = s.auto_texts_on;
  return {
    // No stored value yet → fall back to the env var, which defaults to off.
    autoTextsOn: stored != null ? stored === "1" : process.env.AUTO_TEXTS === "1",
    testTo: (s.auto_texts_test_to ?? process.env.AUTO_TEXTS_TEST_TO ?? "").trim(),
  };
}

export async function putSetting(key: string, value: string | null, who: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_by: who, updated_at: new Date().toISOString() }, { onConflict: "key" });
  return error ? { error: error.message } : { success: true as const };
}
