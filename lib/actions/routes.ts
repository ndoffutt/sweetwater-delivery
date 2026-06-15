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
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("route_stops")
    .delete()
    .eq("id", stopId);

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
