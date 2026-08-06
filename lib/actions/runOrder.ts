"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

const missing = (m?: string) => !!m && /(does not exist|schema cache|could not find)/i.test(m);
const NEEDS = "Run supabase/route_order_changes.sql first.";

type Admin = ReturnType<typeof createAdminClient>;

async function currentOrder(supabase: Admin, routeId: string) {
  const { data } = await supabase
    .from("route_stops")
    .select("id, stop_order, customers(name)")
    .eq("route_id", routeId)
    .is("deleted_at", null)
    .order("stop_order", { ascending: true });
  return ((data ?? []) as unknown as { id: string; stop_order: number; customers: { name: string } | null }[]);
}

/** Log the change. Best-effort: the driver's reorder must never fail because
 *  the audit write did — losing the log is recoverable, blocking him on the
 *  road is not. */
async function logChange(
  supabase: Admin,
  routeId: string,
  kind: "confirm" | "reorder" | "skip",
  before: { id: string }[],
  after: { id: string }[],
  summary: string,
  who: string
) {
  try {
    await supabase.from("route_order_changes").insert({
      route_id: routeId,
      kind,
      before_order: before.map((s) => s.id),
      after_order: after.map((s) => s.id),
      summary,
      changed_by: who,
    });
  } catch { /* audit is not worth failing the drive over */ }
}

/**
 * The pre-drive pass: the driver puts the stops in the order he actually
 * intends to drive, and that becomes the route.
 *
 * Routes were driven in their planned order 0 times out of 9 — usually
 * because he ran them from the other end, which is sensible and was invisible
 * here. Capturing the real order up front is what makes a stop-count ETA
 * honest: predicting two stops ahead is 88% accurate to within 15 minutes,
 * but only if the sequence is real.
 */
export async function confirmRunOrder(routeId: string, orderedStopIds: string[]) {
  const session = await requireSession();
  const supabase = createAdminClient();

  const before = await currentOrder(supabase, routeId);
  const beforeIds = before.map((s) => s.id);
  const changed = orderedStopIds.length !== beforeIds.length
    || orderedStopIds.some((id, i) => id !== beforeIds[i]);

  // Renumber 1..N in the confirmed order.
  const results = await Promise.all(
    orderedStopIds.map((id, i) =>
      supabase.from("route_stops").update({ stop_order: i + 1 }).eq("id", id).eq("route_id", routeId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };

  if (changed) {
    const nameOf = new Map(before.map((s) => [s.id, s.customers?.name ?? "Stop"]));
    const moved = orderedStopIds.filter((id, i) => id !== beforeIds[i]).length;
    await logChange(
      supabase, routeId, "confirm", before, orderedStopIds.map((id) => ({ id })),
      `Run order confirmed with ${moved} stop${moved === 1 ? "" : "s"} moved — now starts at ${nameOf.get(orderedStopIds[0]) ?? "?"}.`,
      session.name
    );
  } else {
    await logChange(supabase, routeId, "confirm", before, before,
      "Run order confirmed as planned.", session.name);
  }

  revalidatePath("/driver");
  revalidatePath("/dispatch");
  revalidatePath("/delivery");
  return { success: true, changed };
}

/** A stop moved after the run started. Allowed — he knows the road — but the
 *  office sees it rather than finding out from the timestamps later. */
export async function logMidRouteReorder(routeId: string, stopId: string, direction: "up" | "down") {
  const session = await requireSession();
  const supabase = createAdminClient();
  const before = await currentOrder(supabase, routeId);
  const name = before.find((s) => s.id === stopId)?.customers?.name ?? "A stop";
  await logChange(
    supabase, routeId, "reorder", before, before,
    `${name} moved ${direction} mid-route.`, session.name
  );
  revalidatePath("/dispatch");
  return { success: true };
}

export interface RouteOrderChange {
  id: string;
  route_id: string;
  kind: string;
  summary: string | null;
  changed_by: string | null;
  seen_at: string | null;
  created_at: string;
}

/** Unseen changes, for the office's "needs a look" count. */
export async function getUnseenOrderChanges(): Promise<RouteOrderChange[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("route_order_changes")
      .select("id, route_id, kind, summary, changed_by, seen_at, created_at")
      .is("seen_at", null)
      .neq("kind", "confirm")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []) as RouteOrderChange[];
  } catch {
    return [];
  }
}

export async function markOrderChangesSeen(ids: string[]) {
  await requireSession("dispatcher");
  if (ids.length === 0) return { success: true };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("route_order_changes")
    .update({ seen_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { error: missing(error.message) ? NEEDS : error.message };
  revalidatePath("/dispatch");
  revalidatePath("/delivery");
  return { success: true };
}
