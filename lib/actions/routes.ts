"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

export async function createRoute(date: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();

  // One van, no driver assignment: the route is owned by whoever builds it; any
  // staff member can open Drive and run it.
  const { data, error } = await supabase
    .from("routes")
    .insert({ date, driver_id: session.id, status: "draft" })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidatePath("/dispatch");
  return { route: data };
}

export async function addStopToRoute(
  routeId: string,
  customerId: string,
  hasDropoff: boolean,
  hasPickup: boolean
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { data: maxOrder } = await supabase
    .from("route_stops")
    .select("stop_order")
    .eq("route_id", routeId)
    .order("stop_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrder?.stop_order ?? 0) + 1;

  const { error } = await supabase.from("route_stops").insert({
    route_id: routeId,
    customer_id: customerId,
    stop_order: nextOrder,
    has_dropoff: hasDropoff,
    has_pickup: hasPickup,
  });

  if (error) return { error: error.message };
  revalidatePath(`/dispatch/route/${routeId}`);
  return { success: true };
}

export async function removeStop(routeId: string, stopId: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();

  // Soft delete — the audit trigger captures the dropped stop in
  // deletion_audit so it can be reviewed (and reversed) from Settings.
  // Falls back to hard delete on a pre-migration environment.
  let { error } = await supabase
    .from("route_stops")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.id })
    .eq("id", stopId);
  if (error && /deleted_at|deleted_by/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message)) {
    ({ error } = await supabase.from("route_stops").delete().eq("id", stopId));
  }

  if (error) return { error: error.message };
  revalidatePath(`/dispatch/route/${routeId}`);
  return { success: true };
}

export async function moveStop(
  routeId: string,
  stopId: string,
  direction: "up" | "down"
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { data: stops } = await supabase
    .from("route_stops")
    .select("id, stop_order")
    .eq("route_id", routeId)
    .order("stop_order");

  if (!stops) return { error: "No stops found" };

  const idx = stops.findIndex((s) => s.id === stopId);
  if (idx === -1) return { error: "Stop not found" };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= stops.length) return { success: true };

  const a = stops[idx];
  const b = stops[swapIdx];

  await supabase
    .from("route_stops")
    .update({ stop_order: b.stop_order })
    .eq("id", a.id);
  await supabase
    .from("route_stops")
    .update({ stop_order: a.stop_order })
    .eq("id", b.id);

  revalidatePath(`/dispatch/route/${routeId}`);
  return { success: true };
}

/**
 * Reorder a route item — delivery stop OR prospect visit — within the SINGLE
 * woven sequence (both share route stop_order). Loads both tables, sorts by
 * stop_order, swaps the target with its neighbor (whatever kind it is), then
 * renumbers everything 1..N so the order stays clean and gap-free. Tolerant of
 * the route_prospect_visits table / stop_order column not existing yet.
 */
export async function moveRouteItem(
  routeId: string,
  itemId: string,
  kind: "stop" | "visit",
  direction: "up" | "down"
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  type Item = { id: string; stop_order: number | null; kind: "stop" | "visit" };
  const { data: stopRows } = await supabase
    .from("route_stops")
    .select("id, stop_order")
    .eq("route_id", routeId)
    .is("deleted_at", null);
  let visitRows: { id: string; stop_order: number | null }[] = [];
  try {
    const { data } = await supabase
      .from("route_prospect_visits")
      .select("id, stop_order")
      .eq("route_id", routeId)
      .is("deleted_at", null);
    visitRows = data ?? [];
  } catch { /* table absent — deliveries only */ }

  const items: Item[] = [
    ...((stopRows ?? []) as { id: string; stop_order: number | null }[]).map((s) => ({ ...s, kind: "stop" as const })),
    ...visitRows.map((v) => ({ ...v, kind: "visit" as const })),
  ].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0));

  const idx = items.findIndex((i) => i.kind === kind && i.id === itemId);
  if (idx === -1) return { error: "Item not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) return { success: true };

  [items[idx], items[swapIdx]] = [items[swapIdx], items[idx]];

  // Renumber the whole sequence 1..N to its new order.
  await Promise.all(
    items.map((it, i) =>
      supabase.from(it.kind === "stop" ? "route_stops" : "route_prospect_visits")
        .update({ stop_order: i + 1 })
        .eq("id", it.id)
    )
  );

  revalidatePath(`/dispatch/route/${routeId}`);
  return { success: true };
}

export async function dispatchRoute(routeId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("routes")
    .update({ status: "dispatched" })
    .eq("id", routeId)
    .eq("status", "draft");

  if (error) return { error: error.message };
  revalidatePath(`/dispatch/route/${routeId}`);
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { success: true };
}
