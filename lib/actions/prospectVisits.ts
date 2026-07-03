"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { easternToday } from "@/lib/date";
import { cheapestInsertion, SHOP } from "@/lib/geo";

const missingTable = (msg: string | undefined) =>
  !!msg && /route_prospect_visits/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);

const NEEDS_MIGRATION = "Run supabase/route_prospect_visits.sql first";

// Call-only prospects are phone/email outreach — they must never be routed.
async function isCallOnly(
  supabase: ReturnType<typeof createAdminClient>,
  prospectId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("prospects")
    .select("call_only")
    .eq("id", prospectId)
    .maybeSingle();
  return !!(data as { call_only?: boolean | null } | null)?.call_only;
}

/**
 * Pick the persisted stop_order for a new prospect visit on a route AND bump
 * the subsequent stops in BOTH tables (route_stops + route_prospect_visits)
 * so the resulting numbered sequence stays gap-free.
 *
 *   - Prospect has lat/lng → cheapest-insertion among current positioned stops.
 *     Whatever index it lands at, every stop at that index or beyond gets +1.
 *   - Call-only / unpositioned → max(stop_order) + 1 (tail of the route).
 *
 * Returns the chosen stop_order. Best-effort: if the migration adding
 * stop_order hasn't run, returns 0 and the caller still inserts (rendering
 * falls back to created_at order until the column exists).
 */
async function pickStopOrderAndBump(
  supabase: ReturnType<typeof createAdminClient>,
  routeId: string,
  point: { lat: number | null; lng: number | null }
): Promise<number> {
  type S = { id: string; stop_order: number | null; lat: number | null; lng: number | null };

  const { data: stopRows } = await supabase
    .from("route_stops")
    .select("id, stop_order, customer:customers(lat, lng)")
    .eq("route_id", routeId);
  const { data: pvRows } = await supabase
    .from("route_prospect_visits")
    .select("id, stop_order, prospects(lat, lng)")
    .eq("route_id", routeId);

  const stops: (S & { table: "route_stops" | "route_prospect_visits" })[] = [
    ...(stopRows ?? []).map((r) => {
      const c = r as unknown as { id: string; stop_order: number | null; customer: { lat: number | null; lng: number | null } | null };
      return { id: c.id, stop_order: c.stop_order, lat: c.customer?.lat ?? null, lng: c.customer?.lng ?? null, table: "route_stops" as const };
    }),
    ...(pvRows ?? []).map((r) => {
      const c = r as unknown as { id: string; stop_order: number | null; prospects: { lat: number | null; lng: number | null } | null };
      return { id: c.id, stop_order: c.stop_order, lat: c.prospects?.lat ?? null, lng: c.prospects?.lng ?? null, table: "route_prospect_visits" as const };
    }),
  ].sort((a, b) => (a.stop_order ?? 9999) - (b.stop_order ?? 9999));

  const maxOrder = stops.reduce((m, s) => Math.max(m, s.stop_order ?? 0), 0);

  // Call-only / unpositioned: tail of the route, no bumps.
  if (point.lat == null || point.lng == null) return maxOrder + 1;

  // Cheapest-insertion among positioned stops.
  const positioned = stops.filter((s) => s.lat != null && s.lng != null);
  if (positioned.length === 0) return maxOrder + 1;

  // Anchor the insertion with the shop at both ends — the van starts and ends
  // at 350 Montauk Hwy, so "cheapest detour" must include the legs to/from the
  // shop (a prospect near the shop belongs at the start or end of the run, not
  // wherever the bare stop chain says).
  const pts = [SHOP, ...positioned.map((s) => ({ lat: s.lat as number, lng: s.lng as number })), SHOP];
  const rawIdx = cheapestInsertion(pts, { lat: point.lat, lng: point.lng });
  const idxInPositioned = Math.max(1, Math.min(pts.length - 1, rawIdx)) - 1;
  // Translate the positioned-only index back to a stop_order value. Going to
  // the very end means "after the last positioned stop", i.e. before any
  // unpositioned tail.
  const insertAt =
    idxInPositioned >= positioned.length
      ? (positioned[positioned.length - 1].stop_order ?? maxOrder) + 1
      : positioned[idxInPositioned].stop_order ?? 1;

  // Bump subsequent stops in both tables. Postgres-side update with a filter;
  // no transaction needed for low-concurrency dispatcher edits.
  const bumpIds = stops.filter((s) => (s.stop_order ?? -1) >= insertAt);
  const stopIds = bumpIds.filter((s) => s.table === "route_stops").map((s) => s.id);
  const pvIds = bumpIds.filter((s) => s.table === "route_prospect_visits").map((s) => s.id);

  for (const s of bumpIds) {
    const tbl = s.table;
    await supabase.from(tbl).update({ stop_order: (s.stop_order ?? 0) + 1 }).eq("id", s.id);
  }
  // Silence "unused" — kept for future batched-update optimization.
  void stopIds; void pvIds;

  return insertAt;
}

/** Tolerant insert: if the stop_order column hasn't been added yet (migration
 * pending), retry without it so the visit still lands. */
async function insertProspectVisit(
  supabase: ReturnType<typeof createAdminClient>,
  row: { route_id: string; prospect_id: string; status: string; stop_order: number }
) {
  let { error } = await supabase
    .from("route_prospect_visits")
    .upsert(row, { onConflict: "route_id,prospect_id" });
  if (error && /stop_order/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message)) {
    const { stop_order: _drop, ...rest } = row;
    void _drop;
    ({ error } = await supabase
      .from("route_prospect_visits")
      .upsert(rest, { onConflict: "route_id,prospect_id" }));
  }
  return error;
}

// Force a prospect onto today's visit list from the Prospects page. Finds the
// route dispatched for today and adds the prospect as a planned visit at its
// cheapest-insertion slot (call-only → end). Returns a friendly error if no
// route is out yet today.
export async function addProspectToTodaysRoute(prospectId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();
  const today = easternToday();

  // Call-only prospects are phone/email outreach — they must never be put on a
  // route, even if they have an address.
  if (await isCallOnly(supabase, prospectId)) {
    return { error: "This is a call-only prospect — reach out by phone/email instead of routing a visit." };
  }

  const { data: route } = await supabase
    .from("routes")
    .select("id, status")
    .eq("date", today)
    .in("status", ["dispatched", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!route) {
    return { error: "No route is out today yet. Dispatch today's route first, then add the visit." };
  }

  // Skip cheapest-insertion if this prospect is already on the route — they
  // keep their slot (upsert just reasserts status='planned' without renumbering).
  const { data: existing } = await supabase
    .from("route_prospect_visits")
    .select("id, stop_order")
    .eq("route_id", route.id)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  let stop_order: number;
  if (existing && existing.stop_order != null) {
    stop_order = existing.stop_order;
  } else {
    const { data: pro } = await supabase
      .from("prospects")
      .select("lat, lng")
      .eq("id", prospectId)
      .single();
    stop_order = await pickStopOrderAndBump(supabase, route.id, {
      lat: pro?.lat ?? null,
      lng: pro?.lng ?? null,
    });
  }

  const error = await insertProspectVisit(supabase, {
    route_id: route.id,
    prospect_id: prospectId,
    status: "planned",
    stop_order,
  });
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };

  revalidatePath("/dispatch");
  revalidatePath("/driver");
  revalidatePath("/sales/prospects");
  return { success: true };
}

// Attach an overdue prospect to today's route as a planned visit. Same
// cheapest-insertion behavior as addProspectToTodaysRoute; this one accepts an
// explicit routeId for the dispatch-screen flow where the dispatcher is
// building a specific route (not necessarily today's).
export async function addProspectVisit(routeId: string, prospectId: string) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  // Call-only prospects never get routed (phone/email outreach only).
  if (await isCallOnly(supabase, prospectId)) {
    return { error: "This is a call-only prospect — reach out by phone/email instead of routing a visit." };
  }

  const { data: existing } = await supabase
    .from("route_prospect_visits")
    .select("id, stop_order")
    .eq("route_id", routeId)
    .eq("prospect_id", prospectId)
    .maybeSingle();

  let stop_order: number;
  if (existing && existing.stop_order != null) {
    stop_order = existing.stop_order;
  } else {
    const { data: pro } = await supabase
      .from("prospects")
      .select("lat, lng")
      .eq("id", prospectId)
      .single();
    stop_order = await pickStopOrderAndBump(supabase, routeId, {
      lat: pro?.lat ?? null,
      lng: pro?.lng ?? null,
    });
  }

  const error = await insertProspectVisit(supabase, {
    route_id: routeId,
    prospect_id: prospectId,
    status: "planned",
    stop_order,
  });
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { success: true };
}

export async function removeProspectVisit(routeId: string, prospectId: string) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  // Soft delete — captured by the audit trigger. Falls back to hard delete
  // on a pre-migration environment so the action still succeeds.
  let { error } = await supabase
    .from("route_prospect_visits")
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.id })
    .eq("route_id", routeId)
    .eq("prospect_id", prospectId);
  if (error && /deleted_at|deleted_by/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message)) {
    ({ error } = await supabase
      .from("route_prospect_visits")
      .delete()
      .eq("route_id", routeId)
      .eq("prospect_id", prospectId));
  }
  if (error && !missingTable(error.message)) return { error: error.message };
  revalidatePath("/dispatch");
  revalidatePath("/driver");
  return { success: true };
}

// Log the visit when the driver arrives: requires notes, marks it visited, and
// records a 'visit' touchpoint on the prospect (clears its overdue reminder).
const TOUCH_TYPES = new Set(["visit", "call", "email", "text"]);

export async function completeProspectVisit(
  id: string,
  prospectId: string,
  notes: string,
  type: string = "visit",
) {
  const session = await requireSession();
  const trimmed = notes?.trim();
  if (!trimmed) return { error: "Please add a quick note about the touchpoint." };
  const touchType = TOUCH_TYPES.has(type) ? type : "visit";
  const supabase = createAdminClient();
  const who = session.role === "admin" ? "Nate" : session.role === "dispatcher" ? "Ahsin" : session.name;

  const { data: pv, error } = await supabase
    .from("route_prospect_visits")
    .update({ status: "visited", visited_at: new Date().toISOString(), notes: trimmed })
    .eq("id", id)
    .select("route_id")
    .single();
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };

  // Touchpoint of the chosen kind (visit / call / email / text) — drives the
  // visit history + overdue clock. First contact moves a fresh prospect along.
  await supabase.from("prospect_touchpoints").insert({
    prospect_id: prospectId,
    type: touchType,
    note: trimmed,
    created_by: who,
  });
  await supabase.from("prospects").update({ status: "working" }).eq("id", prospectId).eq("status", "new");

  // If this was the last open work on the route (all deliveries done + every
  // planned prospect visit logged), flip the route to completed.
  if (pv?.route_id) {
    const { data: openStops } = await supabase
      .from("route_stops")
      .select("id")
      .eq("route_id", pv.route_id)
      .in("status", ["pending", "arrived"]);
    const { data: openVisits } = await supabase
      .from("route_prospect_visits")
      .select("id")
      .eq("route_id", pv.route_id)
      .eq("status", "planned");
    if ((openStops?.length ?? 0) === 0 && (openVisits?.length ?? 0) === 0) {
      await supabase
        .from("routes")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", pv.route_id);
    }
  }

  revalidatePath("/driver");
  revalidatePath("/dispatch");
  revalidatePath("/sales/prospects");
  return { success: true };
}

// "Caution / couldn't do it": mark the planned visit skipped with a reason.
// No touchpoint is logged (no contact was made), so it stays overdue.
export async function skipProspectVisit(id: string, reason: string) {
  await requireSession();
  const supabase = createAdminClient();
  const note = reason?.trim() || "Skipped";

  const { data: pv, error } = await supabase
    .from("route_prospect_visits")
    .update({ status: "skipped", visited_at: new Date().toISOString(), notes: note })
    .eq("id", id)
    .select("route_id")
    .single();
  if (error) return { error: missingTable(error.message) ? NEEDS_MIGRATION : error.message };

  // A skip also clears the route's open-work so a fully resolved route completes.
  if (pv?.route_id) {
    const { data: openStops } = await supabase
      .from("route_stops").select("id").eq("route_id", pv.route_id).in("status", ["pending", "arrived"]);
    const { data: openVisits } = await supabase
      .from("route_prospect_visits").select("id").eq("route_id", pv.route_id).eq("status", "planned");
    if ((openStops?.length ?? 0) === 0 && (openVisits?.length ?? 0) === 0) {
      await supabase.from("routes").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", pv.route_id);
    }
  }

  revalidatePath("/driver");
  revalidatePath("/dispatch");
  return { success: true };
}
