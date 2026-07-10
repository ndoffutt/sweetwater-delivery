"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { cheapestInsertion, seqBetween } from "@/lib/geo";
import { normalizeRouteSeqs } from "@/lib/route";
import { geocodeAddress } from "@/lib/geocode";
import { composeAddress } from "@/lib/address";
import type { DeliveryDay } from "@/lib/deliveryDay";

export interface MasterStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
}
export interface RoutePositioning {
  ok: boolean; // false if route_seq isn't set up yet
  masterRoute: MasterStop[];
  current: number | null; // this customer's existing position, if any
  noCoords?: boolean;
  suggestion: { index: number; seq: number; before?: string; after?: string; lat: number; lng: number } | null;
}

/**
 * Compute where a customer falls in the master delivery route (by best
 * geographic fit), for the "suggest position + confirm on map" flow. Tolerant of
 * a missing route_seq column (returns ok:false).
 */
export async function getRoutePositioning(customerId: string): Promise<RoutePositioning> {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,lat,lng,route_seq")
    .eq("active", true)
    .is("deleted_at", null);
  if (error || !data) return { ok: false, masterRoute: [], current: null, suggestion: null };

  type Row = { id: string; name: string; lat: number | null; lng: number | null; route_seq: number | null };
  const rows = data as Row[];
  const positioned = rows
    .filter((r) => r.route_seq != null && r.lat != null && r.lng != null)
    .sort((a, b) => (a.route_seq as number) - (b.route_seq as number));
  const masterRoute: MasterStop[] = positioned.map((r) => ({ id: r.id, name: r.name, lat: r.lat as number, lng: r.lng as number }));

  const me = rows.find((r) => r.id === customerId);
  if (!me) return { ok: true, masterRoute, current: null, suggestion: null };
  if (me.route_seq != null) return { ok: true, masterRoute, current: me.route_seq, suggestion: null };
  if (me.lat == null || me.lng == null || positioned.length === 0) {
    return { ok: true, masterRoute, current: null, noCoords: me.lat == null, suggestion: null };
  }

  const idx = cheapestInsertion(positioned.map((p) => ({ lat: p.lat as number, lng: p.lng as number })), { lat: me.lat, lng: me.lng });
  const before = positioned[idx - 1];
  const after = positioned[idx];
  const seq = seqBetween(before?.route_seq, after?.route_seq);
  return {
    ok: true,
    masterRoute,
    current: null,
    suggestion: { index: idx, seq, before: before?.name, after: after?.name, lat: me.lat, lng: me.lng },
  };
}

export async function saveRoutePosition(customerId: string, seq: number) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase.from("customers").update({ route_seq: seq }).eq("id", customerId);
  if (error) return { error: error.message };
  // Collapse fractional insert positions back to clean 1..N integers so no two
  // customers share a stop number.
  await normalizeRouteSeqs(supabase);
  revalidatePath("/dispatch/customers");
  return { success: true };
}

/**
 * Drop a customer at the end of the master route. The guaranteed way to give a
 * spot to a customer we can't geographically place (no coords / address won't
 * geocode) — they can always be dragged into the right order afterward.
 */
export async function placeAtEndOfRoute(customerId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("customers")
    .select("route_seq")
    .eq("active", true)
    .is("deleted_at", null)
    .not("route_seq", "is", null)
    .order("route_seq", { ascending: false })
    .limit(1);
  const seq = Math.round((rows?.[0]?.route_seq as number | undefined) ?? 0) + 1;
  const { error } = await supabase.from("customers").update({ route_seq: seq }).eq("id", customerId);
  if (error) return { error: error.message };
  await normalizeRouteSeqs(supabase);
  revalidatePath("/dispatch/customers");
  return { seq };
}

/**
 * Re-number the master route after a manual drag-reorder. The dispatcher passes
 * the positioned customers in their new order; we assign clean sequential
 * route_seq values (1..N) so the order sticks every week.
 */
export async function reorderRoute(orderedIds: string[]) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  // Parallel writes: one round trip of wall-clock instead of one per customer
  // (matters on a 55-stop route over spotty cell service).
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("customers").update({ route_seq: i + 1 }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

interface CustomerInput {
  name: string;
  // Either a full one-line address or the parts (street/town/zip); the action
  // composes the canonical `address` from the parts when they're supplied.
  address?: string;
  street?: string;
  town?: string;
  zip?: string;
  email?: string;
  phone?: string;
  gate_code?: string;
  delivery_notes?: string;
}

// Columns added by supabase/customer_address_split.sql. Stripped on retry when
// the migration hasn't run yet, so saving still works (address stays canonical).
const SPLIT_COLS = ["street", "town", "zip", "email"] as const;
const isMissingColumn = (msg?: string) =>
  !!msg && /column|does not exist|schema cache/i.test(msg);

// Build the DB row from the input: fills the parts, composes the canonical
// address, and returns both the full row and a legacy row (no split columns).
function customerRow(input: Partial<CustomerInput>) {
  const hasParts = input.street != null || input.town != null || input.zip != null;
  const address = hasParts
    ? composeAddress({ street: input.street, town: input.town, zip: input.zip })
    : input.address;

  const full: Record<string, unknown> = {};
  if (input.name != null) full.name = input.name;
  if (input.phone !== undefined) full.phone = input.phone || null;
  if (input.gate_code !== undefined) full.gate_code = input.gate_code || null;
  if (input.delivery_notes !== undefined) full.delivery_notes = input.delivery_notes || null;
  if (input.street !== undefined) full.street = input.street || null;
  if (input.town !== undefined) full.town = input.town || null;
  if (input.zip !== undefined) full.zip = input.zip || null;
  if (input.email !== undefined) full.email = input.email || null;
  if (address != null) full.address = address;

  const legacy = { ...full };
  for (const c of SPLIT_COLS) delete legacy[c];
  return { full, legacy, address };
}

export async function createCustomer(input: CustomerInput) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { full, legacy, address } = customerRow(input);
  // Geocode up front so the route-position suggestion pops right after adding.
  const coords = address ? await geocodeAddress(address) : null;
  full.lat = legacy.lat = coords?.lat ?? null;
  full.lng = legacy.lng = coords?.lng ?? null;

  let { data, error } = await supabase.from("customers").insert(full).select().single();
  if (error && isMissingColumn(error.message)) {
    ({ data, error } = await supabase.from("customers").insert(legacy).select().single());
  }

  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { customer: data };
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { full, legacy, address } = customerRow(input);
  // Address changed → keep the map pin in sync.
  if (address) {
    const coords = await geocodeAddress(address);
    full.lat = legacy.lat = coords?.lat ?? null;
    full.lng = legacy.lng = coords?.lng ?? null;
  }

  let { error } = await supabase.from("customers").update(full).eq("id", id);
  if (error && isMissingColumn(error.message)) {
    ({ error } = await supabase.from("customers").update(legacy).eq("id", id));
  }

  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

// Persist gate code / delivery notes to the customer from the stop view.
// Allowed for any signed-in user (driver or manager) so notes are never lost.
export async function saveCustomerNotes(
  customerId: string,
  fields: { gate_code?: string | null; delivery_notes?: string | null }
) {
  await requireSession();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("customers")
    .update({
      gate_code: fields.gate_code ?? null,
      delivery_notes: fields.delivery_notes ?? null,
    })
    .eq("id", customerId);

  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

/** The customer's run days: Monday, Wednesday (west), and/or Thursday (east). */
export async function setDeliveryDays(customerId: string, days: DeliveryDay[]) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customers")
    .update({ delivery_days: days })
    .eq("id", customerId);
  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

export async function saveCustomerTags(customerId: string, tags: string[]) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("customers")
    .update({ tags })
    .eq("id", customerId);
  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

export async function deleteCustomer(id: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("customers")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dispatch/customers");
  return { success: true };
}

// Shelve a customer as out of range (too far to service now) or bring them
// back. Shelving also pulls them from the master route so the numbering closes
// up; bringing them back leaves them unpositioned and the directory prompts for
// a new route spot.
export async function setCustomerRange(id: string, outOfRange: boolean) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const update: Record<string, unknown> = { out_of_range: outOfRange };
  if (outOfRange) update.route_seq = null;

  const { error } = await supabase.from("customers").update(update).eq("id", id);
  if (error) return { error: error.message };

  if (outOfRange) {
    // Collapse the gap left in the route order (best-effort).
    try { await normalizeRouteSeqs(supabase); } catch { /* non-fatal */ }
  }

  revalidatePath("/dispatch/customers");
  revalidatePath("/dispatch");
  return { success: true };
}
