"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { easternToday } from "@/lib/date";
import { resolveCustomers, type StopResolution } from "@/lib/manifest/match";
import { normalizeRouteSeqs } from "@/lib/route";
import { dayForLocation } from "@/lib/deliveryDay";

export interface ManifestStopInput {
  customer_name: string;
  address: string;
  phone: string | null;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  piece_count?: number | null;
  // Master-route position to assign to a new/unpositioned customer (the
  // dispatcher's confirmed suggestion), so it slots correctly every week.
  route_seq?: number | null;
  // If set, merge this stop into an existing customer (the dispatcher's
  // confirmed match) instead of matching by name / creating a new one.
  customerId?: string | null;
  // Coordinates for a brand-new customer (geocoded from the address, since SPOT
  // manifests carry no lat/lng), so the new customer shows on the maps and can
  // be positioned in the route going forward.
  lat?: number | null;
  lng?: number | null;
}

/**
 * Resolve extracted stops against the existing customer directory so the Scan
 * review screen can show "matched / possible match / new" and let the
 * dispatcher confirm merges before the route is created. Dispatcher-only.
 */
export async function resolveManifestStops(
  stops: { customer_name: string; address: string; phone: string | null }[]
): Promise<StopResolution[]> {
  await requireSession("dispatcher");
  return resolveCustomers(stops);
}

/**
 * Build today's draft route from manifest-extracted stops.
 * Matches each stop to an existing customer by name (case-insensitive) or
 * creates a new one, then upserts today's draft route with the stops in order.
 */
export async function createRouteFromManifest(
  stops: ManifestStopInput[],
  status: "draft" | "dispatched" = "draft"
) {
  await requireSession("dispatcher");

  const clean = stops.filter((s) => s.customer_name.trim() && s.address.trim());
  if (clean.length === 0) return { error: "No valid stops to add" };

  const supabase = createAdminClient();
  const today = easternToday();

  // Driver to assign the route to.
  const { data: driver } = await supabase
    .from("users")
    .select("id")
    .eq("role", "driver")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (!driver) return { error: "No active driver configured" };

  // Match-or-create customers.
  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, route_seq")
    .eq("active", true)
    .is("deleted_at", null);
  const byName = new Map(
    (existing || []).map((c) => [c.name.trim().toLowerCase(), c.id])
  );
  // Current route position per customer, so we only ASSIGN one (never overwrite).
  const seqById = new Map<string, number | null>(
    (existing || []).map((c) => [c.id as string, (c as { route_seq: number | null }).route_seq])
  );

  // Valid existing-customer ids, so a stale/forged customerId can't slip through.
  const validIds = new Set((existing || []).map((c) => c.id));

  // Pass 1: resolve what we can without writing; collect brand-new customers.
  const resolved: { customerId: string | null; stop: ManifestStopInput; newKey?: string }[] = [];
  const toCreate = new Map<string, ManifestStopInput>(); // name key -> first stop
  for (const stop of clean) {
    // 1) Explicit merge decision from the review screen wins.
    if (stop.customerId && validIds.has(stop.customerId)) {
      resolved.push({ customerId: stop.customerId, stop });
      continue;
    }
    // 2) Otherwise fall back to exact-name match, else create.
    const key = stop.customer_name.trim().toLowerCase();
    const customerId = byName.get(key);
    if (customerId) {
      resolved.push({ customerId, stop });
    } else {
      if (!toCreate.has(key)) toCreate.set(key, stop);
      resolved.push({ customerId: null, stop, newKey: key });
    }
  }

  // Pass 2: one batched INSERT for all new customers (instead of a round trip each).
  if (toCreate.size > 0) {
    const entries = Array.from(toCreate.entries());
    const rows = entries.map(([, stop]) => ({
      name: stop.customer_name.trim(),
      address: stop.address.trim(),
      phone: stop.phone?.trim() || null,
      route_seq: stop.route_seq ?? null,
      lat: stop.lat ?? null,
      lng: stop.lng ?? null,
      // East of the shop -> Wednesday run, west -> Thursday.
      delivery_days: ((d) => (d ? [d] : []))(dayForLocation(stop.lng)),
    }));
    let { data: created, error } = await supabase
      .from("customers")
      .insert(rows)
      .select("id, name");
    if (error) {
      // delivery_days column not migrated yet: insert without it.
      const retry = await supabase
        .from("customers")
        .insert(rows.map(({ delivery_days, ...r }) => { void delivery_days; return r; }))
        .select("id, name");
      created = retry.data;
      error = retry.error;
    }
    if (error || !created) {
      return { error: error?.message || "Failed to add a customer" };
    }
    for (const c of created) {
      byName.set(c.name.trim().toLowerCase(), c.id);
    }
    for (const r of resolved) {
      if (r.customerId === null && r.newKey) {
        r.customerId = byName.get(r.newKey) ?? null;
        seqById.set(r.customerId as string, r.stop.route_seq ?? null);
      }
    }
    if (resolved.some((r) => r.customerId === null)) {
      return { error: "Failed to add a customer" };
    }
  }

  // Assign the confirmed master-route position to any customer that doesn't have
  // one yet (new customers, or older ones missing a position). Never overwrite.
  const assigns = resolved.filter(
    (r) => r.stop.route_seq != null && seqById.get(r.customerId as string) == null
  );
  await Promise.all(
    assigns.map((r) => {
      seqById.set(r.customerId as string, r.stop.route_seq as number);
      return supabase
        .from("customers")
        .update({ route_seq: r.stop.route_seq })
        .eq("id", r.customerId as string);
    })
  );

  // New customers land with a fractional seq (e.g. 8.5, to sit between 8 and 9).
  // Always collapse the whole master route back to clean 1..N integers — this
  // shifts everyone after the insertion down by one so two customers never show
  // the same stop number. Idempotent: a no-op when seqs are already 1..N.
  await normalizeRouteSeqs(supabase);

  // Upsert today's draft route (replace stops if one already exists).
  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("date", today)
    .is("deleted_at", null)
    .maybeSingle();

  let routeId: string;
  if (route) {
    routeId = route.id;
    const { data: oldStops } = await supabase
      .from("route_stops")
      .select("id")
      .eq("route_id", routeId);
    if (oldStops && oldStops.length > 0) {
      const ids = oldStops.map((s) => s.id);
      await supabase.from("text_messages").delete().in("stop_id", ids);
      await supabase.from("route_stops").delete().eq("route_id", routeId);
    }
    await supabase
      .from("routes")
      .update({ status, started_at: null, completed_at: null })
      .eq("id", routeId);
  } else {
    const { data: created, error } = await supabase
      .from("routes")
      .insert({ date: today, driver_id: driver.id, status })
      .select("id")
      .single();
    if (error || !created) {
      return { error: error?.message || "Failed to create route" };
    }
    routeId = created.id;
  }

  const rows = resolved.map((r, i) => ({
    route_id: routeId,
    customer_id: r.customerId,
    stop_order: i + 1,
    status: "pending",
    has_dropoff: r.stop.has_dropoff,
    has_pickup: r.stop.has_pickup,
    notes: r.stop.notes?.trim() || null,
    piece_count: r.stop.piece_count ?? 0,
  }));
  const { error: insErr } = await supabase.from("route_stops").insert(rows);
  if (insErr) return { error: insErr.message };

  revalidatePath("/dispatch");
  revalidatePath(`/dispatch/route/${routeId}`);
  return { routeId };
}

/**
 * Discard today's route entirely (stops, photos, queued texts, and the route
 * row) so the Dispatch console returns to a clean scan state for a new upload.
 */
export async function clearTodaysRoute() {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const today = easternToday();

  const { data: route } = await supabase
    .from("routes")
    .select("id")
    .eq("date", today)
    .is("deleted_at", null)
    .maybeSingle();
  if (!route) return { success: true };

  const { data: oldStops } = await supabase
    .from("route_stops")
    .select("id")
    .eq("route_id", route.id);
  const ids = (oldStops ?? []).map((s) => s.id);
  if (ids.length) {
    await supabase.from("text_messages").delete().in("stop_id", ids);
    await supabase.from("stop_photos").delete().in("stop_id", ids);
    await supabase.from("route_stops").delete().eq("route_id", route.id);
  }
  await supabase.from("routes").delete().eq("id", route.id);

  revalidatePath("/dispatch");
  return { success: true };
}

/**
 * Review → Send: write today's route as `dispatched` (the driver app consumes it)
 * with the stops in the given order. Same match-or-create logic as the draft path.
 */
export async function dispatchRoute(stops: ManifestStopInput[]) {
  return createRouteFromManifest(stops, "dispatched");
}

/**
 * Review → Save draft: persist today's reviewed route WITHOUT sending it to the
 * driver, so the work isn't lost if the dispatcher steps away. It reloads back
 * into the review screen (the driver app only consumes `dispatched` routes).
 */
export async function saveDraftRoute(stops: ManifestStopInput[]) {
  return createRouteFromManifest(stops, "draft");
}

export interface LastScan {
  id: string;
  source: string;
  stopCount: number;
  createdAt: string;
  imageUrl: string | null;
  stops: { customer_name: string; address: string; has_dropoff: boolean; has_pickup: boolean }[];
}

/** Most recent scanned manifest, for the Dispatch empty-state preview. */
export async function getLastManifestScan(): Promise<LastScan | null> {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("manifest_scans")
    .select("id, source, stop_count, created_at, image_path, stops")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  let imageUrl: string | null = null;
  if (data.image_path) {
    const { data: signed } = await supabase.storage
      .from("manifests")
      .createSignedUrl(data.image_path, 60 * 60);
    imageUrl = signed?.signedUrl ?? null;
  }

  return {
    id: data.id,
    source: data.source,
    stopCount: data.stop_count,
    createdAt: data.created_at,
    imageUrl,
    stops: (data.stops as LastScan["stops"]) ?? [],
  };
}
