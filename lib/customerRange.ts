import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * IDs of active customers marked out of range (too far to service now). Returns
 * an empty set if the `out_of_range` column hasn't been migrated yet — the safe
 * default is "everyone is in range", so route building keeps working.
 */
export async function outOfRangeIdSet(supabase: Admin): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("out_of_range", true)
    .is("deleted_at", null);
  if (error) return new Set();
  return new Set((data ?? []).map((r: { id: string }) => r.id));
}
