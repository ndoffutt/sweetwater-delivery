"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { recordAndSend } from "@/lib/messaging";
import { trackUrl } from "@/lib/track";
import type { StopStatus } from "@/lib/types";

// Best-effort auto-text on arrive/complete. Sends for real once Twilio is
// configured; until then it's recorded as pending. No-op without a phone.
async function autoText(
  supabase: ReturnType<typeof createAdminClient>,
  stopId: string,
  message: string
) {
  const { data: stop } = await supabase
    .from("route_stops")
    .select("customer_id, customers(phone)")
    .eq("id", stopId)
    .single();
  const customer = stop?.customers as unknown as { phone: string | null } | null;
  if (!customer?.phone) return;
  await recordAndSend({
    phone: customer.phone,
    body: message,
    customerId: (stop as unknown as { customer_id: string }).customer_id,
    stopId,
    senderName: "Auto",
  });
}

// When the van rolls (route flips to in_progress), text every customer on the
// route their personal tracking link - the Domino's-style "out for delivery"
// moment. Gated behind TRACK_LINKS=1 because the 10DLC campaign must declare
// embedded links before texts may carry URLs; until then this is a no-op.
async function notifyRouteStarted(
  supabase: ReturnType<typeof createAdminClient>,
  routeId: string
) {
  if (process.env.TRACK_LINKS !== "1") return;
  const { data: stops } = await supabase
    .from("route_stops")
    .select("id, customer_id, status, customers(name, phone)")
    .eq("route_id", routeId)
    .eq("status", "pending");
  const list = (stops ?? []) as unknown as {
    id: string;
    customer_id: string;
    customers: { name: string; phone: string | null } | null;
  }[];
  await Promise.all(
    list
      .filter((s) => s.customers?.phone)
      .map((s) =>
        recordAndSend({
          phone: s.customers!.phone!,
          body: `Sweetwater's Cleaners: your delivery is out for delivery today. Track it live: ${trackUrl(s.id)}`,
          customerId: s.customer_id,
          stopId: s.id,
          senderName: "Auto",
        })
      )
  );
}

// A completed delivery to an active prospect is logged as its own "delivery"
// touch (van icon) — and still counts toward "last visited", so it clears the
// overdue reminder. Best-effort and deduped to one per prospect per day; never
// blocks the delivery if anything here fails.
async function logDeliveryVisit(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string | null,
  driverName: string
) {
  if (!customerId) return;
  try {
    const { data: prospect } = await supabase
      .from("prospects")
      .select("id")
      .eq("customer_id", customerId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    if (!prospect) return;

    // Don't double-log if a visit or delivery was already recorded in ~18h.
    const cutoff = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("prospect_touchpoints")
      .select("id")
      .eq("prospect_id", prospect.id)
      .in("type", ["visit", "delivery"])
      .gte("created_at", cutoff)
      .limit(1);
    if (recent && recent.length > 0) return;

    const row = { prospect_id: prospect.id, created_by: driverName || "Delivery" };
    const { error } = await supabase
      .from("prospect_touchpoints")
      .insert({ ...row, type: "delivery", note: null });
    // Fall back to a visit if the 'delivery' type isn't migrated in yet.
    if (error) {
      await supabase
        .from("prospect_touchpoints")
        .insert({ ...row, type: "visit", note: "Delivery" });
    }
    revalidatePath("/sales/prospects");
  } catch {
    /* prospects tables may not exist yet; delivery completion must still succeed */
  }
}

// Mark the route completed ONLY if both real delivery stops AND any planned
// prospect visits attached to it are done. Without the prospect-visit check,
// completing the last delivery would flip the route to "completed", causing
// the driver page (which only loads dispatched/in_progress routes) to drop the
// whole route — including any still-unlogged prospect visits.
async function maybeCompleteRoute(
  supabase: ReturnType<typeof createAdminClient>,
  routeId: string
) {
  const { data: openStops } = await supabase
    .from("route_stops")
    .select("id")
    .eq("route_id", routeId)
    .in("status", ["pending", "arrived"]);
  if ((openStops?.length ?? 0) > 0) return;

  // Planned prospect visits keep the route open. Tolerant of the
  // route_prospect_visits table not existing yet.
  try {
    const { data: openVisits } = await supabase
      .from("route_prospect_visits")
      .select("id")
      .eq("route_id", routeId)
      .eq("status", "planned");
    if ((openVisits?.length ?? 0) > 0) return;
  } catch {
    /* table absent — fall through and complete the route */
  }

  await supabase
    .from("routes")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", routeId);
}

export async function updateStopStatus(stopId: string, status: StopStatus) {
  const session = await requireSession();
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = { status };

  if (status === "arrived") {
    updates.arrived_at = new Date().toISOString();
  }
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const { data: stop, error } = await supabase
    .from("route_stops")
    .update(updates)
    .eq("id", stopId)
    .select("route_id, customer_id")
    .single();

  if (error) return { error: error.message };

  // If first stop arrived, start the route. The .eq("status","dispatched")
  // guard + .select() makes this fire exactly once per route: only the call
  // that flips dispatched -> in_progress gets rows back.
  if (status === "arrived") {
    const { data: started } = await supabase
      .from("routes")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", stop.route_id)
      .eq("status", "dispatched")
      .select("id");
    if (started && started.length > 0) {
      await notifyRouteStarted(supabase, stop.route_id);
    }
  }

  // Check if all stops are completed/skipped to complete the route
  if (status === "completed" || status === "skipped") {
    await maybeCompleteRoute(supabase, stop.route_id);
  }

  // Auto-text the customer on arrive / complete (per the map-first flow).
  if (status === "arrived") {
    await autoText(supabase, stopId, "Hi! Your Sweetwater's delivery is on the way.");
  }
  if (status === "completed") {
    await autoText(supabase, stopId, "Your Sweetwater's delivery is complete.");
    await logDeliveryVisit(supabase, stop.customer_id, session.name);
  }

  revalidatePath(`/driver/stop/${stopId}`);
  revalidatePath("/driver");
  revalidatePath(`/dispatch/route/${stop.route_id}`);
  return { success: true };
}

// Flag a stop the driver couldn't complete (gate code failed, nobody home, …).
// Marks it skipped, records the reason, and completes the route if it's the last.
export async function flagStop(stopId: string, reason: string) {
  await requireSession();
  const supabase = createAdminClient();

  const { data: stop, error } = await supabase
    .from("route_stops")
    .update({
      status: "skipped",
      notes: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", stopId)
    .select("route_id")
    .single();

  if (error) return { error: error.message };

  await maybeCompleteRoute(supabase, stop.route_id);

  revalidatePath("/driver");
  revalidatePath(`/dispatch/route/${stop.route_id}`);
  return { success: true };
}

export async function confirmDropoff(stopId: string, confirmed: boolean) {
  await requireSession();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("route_stops")
    .update({ dropoff_confirmed: confirmed })
    .eq("id", stopId);

  if (error) return { error: error.message };
  revalidatePath(`/driver/stop/${stopId}`);
  return { success: true };
}

export async function confirmPickup(stopId: string, confirmed: boolean) {
  await requireSession();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("route_stops")
    .update({ pickup_confirmed: confirmed })
    .eq("id", stopId);

  if (error) return { error: error.message };
  revalidatePath(`/driver/stop/${stopId}`);
  return { success: true };
}

export async function sendSms(stopId: string, message: string) {
  const session = await requireSession();
  const supabase = createAdminClient();

  const { data: stop } = await supabase
    .from("route_stops")
    .select("customer_id, customers(phone)")
    .eq("id", stopId)
    .single();

  const customer = stop?.customers as unknown as { phone: string | null } | null;
  if (!customer?.phone) return { error: "No phone number for customer" };

  const res = await recordAndSend({
    phone: customer.phone,
    body: message,
    customerId: (stop as unknown as { customer_id: string }).customer_id,
    stopId,
    senderName: session.name,
  });
  if (res.status === "failed") return { error: res.error || "Couldn't send" };
  return { success: true };
}

// Edit a delivery (route stop) after the fact — drop-off/pickup, piece count,
// notes, and status. Manager/owner only. Used by the delivery detail page that
// the "Recent activity" delivery cards link to.
export async function updateDelivery(
  stopId: string,
  fields: {
    has_dropoff?: boolean;
    has_pickup?: boolean;
    piece_count?: number;
    notes?: string | null;
    status?: StopStatus;
  }
) {
  await requireSession("dispatcher");
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = {};
  if (fields.has_dropoff !== undefined) patch.has_dropoff = fields.has_dropoff;
  if (fields.has_pickup !== undefined) patch.has_pickup = fields.has_pickup;
  if (fields.piece_count !== undefined) patch.piece_count = Math.max(0, Math.round(fields.piece_count));
  if (fields.notes !== undefined) patch.notes = fields.notes?.toString().trim() || null;
  if (fields.status !== undefined) patch.status = fields.status;

  const { data: stop, error } = await supabase
    .from("route_stops")
    .update(patch)
    .eq("id", stopId)
    .select("route_id")
    .single();
  if (error) return { error: error.message };

  revalidatePath(`/dispatch/delivery/${stopId}`);
  revalidatePath("/owner");
  revalidatePath("/dispatch/history");
  revalidatePath("/dispatch/customers");
  if (stop?.route_id) revalidatePath(`/dispatch/route/${stop.route_id}`);
  return { success: true };
}
