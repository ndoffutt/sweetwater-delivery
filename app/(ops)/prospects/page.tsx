import { createAdminClient } from "@/lib/supabase/admin";
import { easternToday } from "@/lib/date";
import { haversineMiles } from "@/lib/geo";
import { dayForDow } from "@/lib/deliveryDay";
import ProspectsBoard, { type BoardData, type BoardCard } from "@/components/ops/ProspectsBoard";
import { lastEngagementAt, overdueDaysFor, needsAttention } from "@/lib/prospectVisit";
import type { Prospect, ProspectTouchpoint } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({ searchParams }: { searchParams?: { seg?: string } }) {
  const supabase = createAdminClient();
  const today = easternToday();

  const { data } = await supabase
    .from("prospects")
    .select("*, touchpoints:prospect_touchpoints(id, type, note, created_at)")
    .is("deleted_at", null);
  const prospects = ((data ?? []) as unknown as (Prospect & { touchpoints: ProspectTouchpoint[] })[]);

  // Today's run, for "on today's run" and the nearby block.
  const { data: route } = await supabase
    .from("routes")
    .select("id, route_stops(stop_order, deleted_at, customers(lat, lng))")
    .eq("date", today)
    .is("deleted_at", null)
    .maybeSingle();
  type RS = { stop_order: number; deleted_at?: string | null; customers: { lat: number | null; lng: number | null } | null };
  const stops = (((route as { route_stops?: RS[] } | null)?.route_stops ?? []) as RS[])
    .filter((s) => !s.deleted_at && s.customers?.lat != null && s.customers?.lng != null);
  const routeId = (route as { id?: string } | null)?.id ?? null;

  // Already-planned visits on today's route.
  let plannedIds = new Set<string>();
  if (routeId) {
    try {
      const { data: pv } = await supabase
        .from("route_prospect_visits")
        .select("prospect_id, deleted_at")
        .eq("route_id", routeId);
      plannedIds = new Set(
        ((pv ?? []) as { prospect_id: string; deleted_at?: string | null }[])
          .filter((v) => !v.deleted_at)
          .map((v) => v.prospect_id)
      );
    } catch { /* table missing */ }
  }

  const nearStop = (p: Prospect): { stop: number; miles: number } | null => {
    if (p.lat == null || p.lng == null || stops.length === 0) return null;
    let best: { stop: number; miles: number } | null = null;
    for (const s of stops) {
      const m = haversineMiles({ lat: p.lat, lng: p.lng }, { lat: s.customers!.lat!, lng: s.customers!.lng! });
      if (!best || m < best.miles) best = { stop: s.stop_order, miles: m };
    }
    return best && best.miles <= 1.5 ? best : null;
  };

  const daysSince = (iso: string | null) =>
    iso == null ? null : Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  const cards: BoardCard[] = prospects.map((p) => {
    const lastAt = lastEngagementAt(p.touchpoints);
    const lastTp = [...(p.touchpoints ?? [])]
      .filter((t) => t.type !== "note")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const days = daysSince(lastAt);
    const window = overdueDaysFor(p.priority);
    const overdueBy = !["on_hold", "dead"].includes(p.status) && days != null ? days - window : null;
    const near = nearStop(p);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      segment: p.business_type,
      town: p.town ?? (p.address ? p.address.split(",")[1]?.trim() ?? null : null),
      priority: p.priority ?? "medium",
      services: (p.services ?? []) as string[],
      overdueDays: needsAttention(p) ? Math.max(overdueBy ?? 0, 0) : null,
      neverTouched: lastAt == null,
      lastLine: lastTp ? `Last: ${lastTp.type} · ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`}` : "No touch yet",
      onHoldReason: p.status === "on_hold" ? (p.notes ?? null) : null,
      onTodaysRun: plannedIds.has(p.id) ? "added" : near ? "near" : null,
      nearStop: near,
      callOnly: p.call_only ?? (p.lat == null || p.lng == null),
    };
  });

  // Touchpoints this week by type.
  const weekAgoMs = Date.now() - 7 * 86400000;
  const tpCounts = { visit: 0, call: 0, email: 0, text: 0 };
  for (const p of prospects)
    for (const t of p.touchpoints ?? [])
      if (new Date(t.created_at).getTime() >= weekAgoMs && t.type in tpCounts)
        tpCounts[t.type as keyof typeof tpCounts]++;

  const runDay = dayForDow(new Date(today + "T12:00:00Z").getUTCDay());

  const boardData: BoardData = {
    cards,
    seg: searchParams?.seg ?? "all",
    tpCounts,
    routeId,
    runLabel: runDay === "wednesday" ? "west run" : runDay === "thursday" ? "east run" : "today",
    nearby: cards
      .filter((c) => c.nearStop && !["on_hold", "dead"].includes(c.status))
      .sort((a, b) => (a.nearStop!.miles - b.nearStop!.miles))
      .slice(0, 4),
  };

  return <ProspectsBoard data={boardData} />;
}
