import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Renumber the master route to clean, unique, sequential integers (1..N) by
 * current route_seq order. New customers are inserted with a fractional seq
 * (e.g. 21.5 to land between 21 and 22); this collapses those back to whole
 * numbers and shifts every stop after the insertion down by one, so two stops
 * never share a number. Idempotent: stops already numbered correctly are left
 * untouched, so it's cheap to call after any insert/move.
 */
export async function normalizeRouteSeqs(supabase: Admin): Promise<void> {
  const { data } = await supabase
    .from("customers")
    .select("id, route_seq")
    .eq("active", true)
    .is("deleted_at", null)
    .not("route_seq", "is", null)
    .order("route_seq", { ascending: true });
  if (!data) return;

  // Only rows whose number actually changes get written, and the writes run in
  // parallel: wall-clock is one round trip instead of one per customer.
  const writes = (data as { id: string; route_seq: number }[])
    .map((c, idx) => ({ id: c.id, seq: idx + 1, changed: c.route_seq !== idx + 1 }))
    .filter((w) => w.changed)
    .map((w) => supabase.from("customers").update({ route_seq: w.seq }).eq("id", w.id));
  if (writes.length) await Promise.all(writes);
}
