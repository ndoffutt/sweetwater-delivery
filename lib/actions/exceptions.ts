"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";

const missingTable = (msg: string | undefined) =>
  !!msg && /exception_resolutions/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);

export type ExceptionKind = "skipped" | "nophoto";

export interface DeliveryException {
  stopId: string;
  kind: ExceptionKind;
  customerId: string | null;
  customerName: string;
  date: string; // route date (YYYY-MM-DD)
  detail: string;
}

/**
 * Derive the open "needs attention" exceptions from the last `days` of
 * deliveries: skipped stops (with their reason) and completed stops that have
 * no photo proof. Resolutions recorded in exception_resolutions hide them.
 * Tolerant of that table not existing yet (everything shows as open).
 */
export async function getOpenExceptions(days = 14): Promise<DeliveryException[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("route_stops")
    .select(
      "id, status, notes, completed_at, customer_id, customers(id, name), routes!inner(date, status), stop_photos(id)"
    )
    .in("status", ["skipped", "completed"])
    .gte("routes.date", since);

  type Row = {
    id: string; status: string; notes: string | null; completed_at: string | null;
    customer_id: string | null;
    customers: { id: string; name: string } | null;
    routes: { date: string; status: string } | null;
    stop_photos: { id: string }[] | null;
  };

  const candidates: DeliveryException[] = [];
  for (const r of (rows ?? []) as unknown as Row[]) {
    const name = r.customers?.name ?? "Customer";
    const date = r.routes?.date ?? "";
    if (r.status === "skipped") {
      candidates.push({
        stopId: r.id, kind: "skipped", customerId: r.customer_id, customerName: name, date,
        detail: r.notes ? `Skipped — ${r.notes}` : "Stop was skipped.",
      });
    } else if (r.status === "completed" && (r.stop_photos?.length ?? 0) === 0 && r.routes?.status === "completed") {
      // Only flag missing photos once the route is done — mid-route the photo
      // may simply still be uploading from the driver's queue.
      candidates.push({
        stopId: r.id, kind: "nophoto", customerId: r.customer_id, customerName: name, date,
        detail: "Marked delivered, but no photo proof was attached.",
      });
    }
  }
  if (candidates.length === 0) return [];

  // Drop the ones already resolved (best-effort if the table is absent).
  try {
    const { data: res, error } = await supabase
      .from("exception_resolutions")
      .select("stop_id, kind")
      .in("stop_id", candidates.map((c) => c.stopId));
    if (error) throw error;
    const resolved = new Set((res ?? []).map((r) => `${r.stop_id}:${r.kind}`));
    return candidates
      .filter((c) => !resolved.has(`${c.stopId}:${c.kind}`))
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return candidates.sort((a, b) => b.date.localeCompare(a.date));
  }
}

/** Mark an exception handled so it stops surfacing on Today. */
export async function resolveException(stopId: string, kind: ExceptionKind) {
  const session = await requireSession("dispatcher");
  const supabase = createAdminClient();
  const who = session.role === "admin" ? "Nate" : session.role === "dispatcher" ? "Ahsin" : session.name;
  const { error } = await supabase
    .from("exception_resolutions")
    .upsert({ stop_id: stopId, kind, resolved_by: who }, { onConflict: "stop_id,kind" });
  if (error) {
    return {
      error: missingTable(error.message)
        ? "Run supabase/exception_resolutions.sql first"
        : error.message,
    };
  }
  revalidatePath("/dispatch");
  return { success: true };
}

export interface ResolvedException extends DeliveryException {
  resolvedBy: string | null;
  resolvedAt: string;
}

/** Recently-resolved exceptions for the Record page's log (best-effort). */
export async function getResolvedExceptions(days = 14): Promise<ResolvedException[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  try {
    const { data, error } = await supabase
      .from("exception_resolutions")
      .select("stop_id, kind, resolved_by, resolved_at, route_stops(id, notes, customer_id, customers(name), routes(date))")
      .gte("resolved_at", since)
      .order("resolved_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    type Row = {
      stop_id: string; kind: ExceptionKind; resolved_by: string | null; resolved_at: string;
      route_stops: {
        id: string; notes: string | null; customer_id: string | null;
        customers: { name: string } | null; routes: { date: string } | null;
      } | null;
    };
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      stopId: r.stop_id,
      kind: r.kind,
      customerId: r.route_stops?.customer_id ?? null,
      customerName: r.route_stops?.customers?.name ?? "Customer",
      date: r.route_stops?.routes?.date ?? "",
      detail:
        r.kind === "nophoto"
          ? "Marked delivered, but no photo proof was attached."
          : r.route_stops?.notes
          ? `Skipped — ${r.route_stops.notes}`
          : "Stop was skipped.",
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
    }));
  } catch {
    return [];
  }
}
