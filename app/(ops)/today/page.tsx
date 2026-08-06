import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";
import { getOpenExceptions } from "@/lib/actions/exceptions";
import { easternToday } from "@/lib/date";
import { dayForDow } from "@/lib/deliveryDay";
import {
  getThreadTable,
  getOverdueProspectCount,
  getActionItems,
  getTeamMembers, getEntityComments, getRetentionCustomers,
  getWeeklyRow,
  currentWeekStart,
} from "@/lib/opsData";
import TodayView, { type TodayData } from "@/components/ops/TodayView";
import type { Prospect } from "@/lib/types";
import { needsAttention, daysOverdue } from "@/lib/prospectVisit";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const session = await getSession();
  const supabase = createAdminClient();
  const today = easternToday();
  const week = currentWeekStart();

  // ── Delivery: today's route + stop states ──
  const { data: route } = await supabase
    .from("routes")
    .select(
      `id, status, started_at,
       route_stops(id, stop_order, status, deleted_at, customers(name))`
    )
    .eq("date", today)
    .is("deleted_at", null)
    .order("stop_order", { referencedTable: "route_stops" })
    .maybeSingle();

  type StopRow = { id: string; stop_order: number; status: string; deleted_at?: string | null; customers: { name: string } | null };
  const stops = (((route as { route_stops?: StopRow[] } | null)?.route_stops ?? []) as StopRow[])
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.stop_order - b.stop_order);

  // ── The other three bands ──
  const [exceptions, allThreads, overdueProspects, items, team, weekly] = await Promise.all([
    getOpenExceptions(14).catch(() => []),
    getThreadTable(supabase),
    getOverdueProspectCount(supabase),
    getActionItems(supabase, week),
    getTeamMembers(supabase),
    getWeeklyRow(supabase, week),
  ]);
  const itemComments = await getEntityComments(supabase, "action_item", items.map((i) => i.id));
  const retention = await getRetentionCustomers(supabase);
  const retentionComments = await getEntityComments(supabase, "retention", retention.map((r) => r.id));

  // Archived conversations are handled — don't resurface them on Today.
  const threads = allThreads.filter((t) => !t.archived);

  // Most urgent prospect facts for the one-line summary.
  let prospectLine = "";
  try {
    const { data } = await supabase
      .from("prospects")
      .select("name, status, priority, created_at, manual_request_at, touchpoints:prospect_touchpoints(type, created_at)")
      .is("deleted_at", null)
      .in("status", ["new", "working", "active"]);
    const overdueList = ((data ?? []) as unknown as (Prospect & { name: string })[])
      .filter(needsAttention)
      .sort((a, b) => daysOverdue(b) - daysOverdue(a));
    const worst = overdueList[0];
    if (worst) {
      const over = daysOverdue(worst);
      prospectLine = over > 0
        ? `${worst.name} is ${over} ${over === 1 ? "day" : "days"} past due`
        : `${worst.name} was flagged for outreach`;
    }
  } catch { /* fine — line stays empty */ }

  const waiting = threads.filter((t) => t.waitingSince);
  const runDay = dayForDow(new Date(today + "T12:00:00Z").getUTCDay());

  const data: TodayData = {
    userName: session?.name ?? "",
    todayIso: new Date().toISOString(),
    route: route
      ? {
          id: (route as { id: string }).id,
          status: (route as { status: string }).status,
          runLabel: runDay === "wednesday" ? "west run" : runDay === "thursday" ? "east run" : "run",
          stops: stops.map((s) => ({ id: s.id, order: s.stop_order, status: s.status, name: s.customers?.name ?? "Stop" })),
        }
      : null,
    exceptions: exceptions.slice(0, 3).map((e) => ({
      stopId: e.stopId,
      kind: e.kind,
      label: e.kind === "skipped" ? "Skipped" : "No photo",
      sentence: `${e.customerName} — ${e.detail}`,
    })),
    messages: {
      waitingCount: waiting.length,
      totalThreads: threads.length,
      rows: waiting.slice(0, 3).map((t) => ({
        digits: t.digits,
        name: t.name,
        excerpt: t.lastBody,
        about: t.deliveryRelated ? `Delivery-related · ${t.about.toLowerCase()}` : `Not delivery · ${t.about.toLowerCase()}`,
        waitingSince: t.waitingSince,
        waitingMessageId: t.waitingMessageId,
        channels: t.channels,
      })),
    },
    reports: {
      hasDraft: !!weekly,
      submitted: !!weekly?.submitted_at,
      swYtd: weekly?.sweetwater_ytd ?? null,
      swPrior: weekly?.sweetwater_ytd_prior ?? null,
      deliveryYtd: weekly?.delivery_ytd ?? null,
      openItemCount: items.filter((i) => !i.completed_week).length,
    },
    actionItems: items,
    itemComments,
    retention,
    retentionComments,
    team,
    prospects: { overdue: overdueProspects, line: prospectLine },
    weekStart: week,
  };

  return <TodayView data={data} />;
}
