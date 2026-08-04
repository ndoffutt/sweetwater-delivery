// Server-side data assembly shared by the Ops Hub pages (/today, /messages,
// /reports, /prospects). Owner-only surfaces; every query is tolerant of a
// missing table or column so an un-migrated environment renders empty rather
// than erroring.
import { createAdminClient } from "@/lib/supabase/admin";
import { needsAttention } from "@/lib/prospectVisit";
import { easternToday } from "@/lib/date";
import type { Prospect } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

const digitsOf = (s: string | null | undefined) => (s || "").replace(/\D/g, "").slice(-10);

export interface ThreadRow {
  digits: string;
  phone: string;
  /** Channel(s) the thread arrived on. SMS today; email joins when the shared
   *  mailbox sync lands — the column exists so the table doesn't reshape. */
  channels: ("text" | "email")[];
  name: string;
  known: boolean;
  lastBody: string;
  lastAt: string;
  /** Set when the last message is inbound and unanswered. */
  waitingSince: string | null;
  about: string;
  deliveryRelated: boolean;
  kind: "customer" | "prospect" | "contact" | "unknown";
}

/** The unified message table: one row per phone thread, newest first. */
export async function getThreadTable(supabase: Admin): Promise<ThreadRow[]> {
  type M = { phone: string; direction: "inbound" | "outbound"; body: string | null; created_at: string };
  let msgs: M[] = [];
  try {
    // The live inbox is the v2 `messages` table (messaging_v2.sql). The old
    // text_messages table is only a legacy queue — reading it here left this
    // page empty while real conversations sat in `messages`.
    const { data, error } = await supabase
      .from("messages")
      .select("phone, direction, body, created_at")
      .order("created_at", { ascending: true })
      .limit(4000);
    if (error) return [];
    msgs = (data ?? []) as M[];
  } catch {
    return [];
  }

  // Name sources.
  const [customers, prospects, contacts, route] = await Promise.all([
    supabase.from("customers").select("id, name, phone").is("deleted_at", null).then((r) => r.data ?? []),
    supabase.from("prospects").select("id, name, phone, priority").is("deleted_at", null).then((r) => r.data ?? []),
    supabase
      .from("message_contacts")
      .select("phone_digits, name")
      .then((r) => r.data ?? [], () => []),
    supabase
      .from("routes")
      .select("id, route_stops(stop_order, customer_id)")
      .eq("date", easternToday())
      .is("deleted_at", null)
      .maybeSingle()
      .then((r) => r.data ?? null),
  ]);

  const custByDigits = new Map<string, { id: string; name: string }>();
  for (const c of customers as { id: string; name: string; phone: string | null }[]) {
    const d = digitsOf(c.phone);
    if (d) custByDigits.set(d, { id: c.id, name: c.name });
  }
  const prosByDigits = new Map<string, { name: string; priority: string | null }>();
  for (const p of prospects as { name: string; phone: string | null; priority: string | null }[]) {
    const d = digitsOf(p.phone);
    if (d) prosByDigits.set(d, { name: p.name, priority: p.priority });
  }
  const contactByDigits = new Map<string, string>();
  for (const c of contacts as { phone_digits: string; name: string }[]) {
    if (c.phone_digits) contactByDigits.set(c.phone_digits.slice(-10), c.name);
  }
  const stopByCustomer = new Map<string, number>();
  if (route) {
    for (const s of ((route as { route_stops?: { stop_order: number; customer_id: string | null }[] }).route_stops ?? [])) {
      if (s.customer_id) stopByCustomer.set(s.customer_id, s.stop_order);
    }
  }

  // Fold messages into threads.
  interface Acc { phone: string; lastBody: string; lastAt: string; lastDirection: "inbound" | "outbound"; waitingSince: string | null }
  const acc = new Map<string, Acc>();
  for (const m of msgs) {
    const d = digitsOf(m.phone);
    if (!d) continue;
    const t = acc.get(d) ?? { phone: m.phone, lastBody: "", lastAt: m.created_at, lastDirection: m.direction, waitingSince: null };
    t.lastBody = (m.body ?? "").slice(0, 160);
    t.lastAt = m.created_at;
    t.lastDirection = m.direction;
    // waitingSince = the first inbound after the last outbound.
    if (m.direction === "outbound") t.waitingSince = null;
    else if (t.waitingSince == null) t.waitingSince = m.created_at;
    acc.set(d, t);
  }

  const rows: ThreadRow[] = [];
  acc.forEach((t, digits) => {
    const cust = custByDigits.get(digits);
    const pros = prosByDigits.get(digits);
    const contact = contactByDigits.get(digits);
    const stop = cust ? stopByCustomer.get(cust.id) : undefined;

    const name = cust?.name ?? pros?.name ?? contact ?? t.phone;
    const kind: ThreadRow["kind"] = cust ? "customer" : pros ? "prospect" : contact ? "contact" : "unknown";
    const about =
      stop != null ? `Delivery · stop ${stop}`
      : cust ? "Customer"
      : pros ? `Prospect${pros.priority ? ` · ${pros.priority}` : ""}`
      : contact ? "Contact"
      : "Unknown number";

    rows.push({
      digits,
      phone: t.phone,
      channels: ["text"],
      name,
      known: kind !== "unknown",
      lastBody: t.lastBody,
      lastAt: t.lastAt,
      waitingSince: t.lastDirection === "inbound" ? t.waitingSince : null,
      about,
      deliveryRelated: stop != null,
      kind,
    });
  });

  // Waiting threads first (oldest wait at the top), then everything by recency.
  return rows.sort((a, b) => {
    if (!!a.waitingSince !== !!b.waitingSince) return a.waitingSince ? -1 : 1;
    if (a.waitingSince && b.waitingSince) return a.waitingSince.localeCompare(b.waitingSince);
    return b.lastAt.localeCompare(a.lastAt);
  });
}

export async function getOverdueProspectCount(supabase: Admin): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("prospects")
      .select("status, priority, created_at, manual_request_at, touchpoints:prospect_touchpoints(type, created_at)")
      .is("deleted_at", null)
      .in("status", ["new", "working", "active"]);
    if (error) return 0;
    return ((data ?? []) as unknown as Prospect[]).filter(needsAttention).length;
  } catch {
    return 0;
  }
}

export interface OpenActionItem {
  id: string;
  owner: string;
  action: string;
  section: "operations" | "growth";
  opened_week: string;
  completed_week: string | null;
}

export async function getActionItems(supabase: Admin, weekStart: string): Promise<OpenActionItem[]> {
  try {
    const { data, error } = await supabase
      .from("action_items")
      .select("id, owner, action, section, opened_week, completed_week")
      .is("deleted_at", null)
      .or(`completed_week.is.null,completed_week.eq.${weekStart}`)
      .order("opened_week", { ascending: true });
    if (error) return [];
    return (data ?? []) as OpenActionItem[];
  } catch {
    return [];
  }
}

/** Monday-anchored week start (YYYY-MM-DD) for the Eastern calendar today. */
export function currentWeekStart(): string {
  const d = new Date(easternToday() + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface WeeklyRow {
  week_start: string;
  sweetwater_revenue: number | null;
  jrs_revenue: number | null;
  delivery_revenue: number | null;
  sweetwater_ytd: number | null;
  jrs_ytd: number | null;
  delivery_ytd: number | null;
  sweetwater_ytd_prior: number | null;
  jrs_ytd_prior: number | null;
  staffing_status: string | null;
  staffing_note: string | null;
  equipment_status: string | null;
  equipment_note: string | null;
  blocking_growth: string | null;
  key_updates: string | null;
  expectation_note: string | null;
  submitted_at: string | null;
}

export async function getWeeklyRow(supabase: Admin, weekStart: string): Promise<WeeklyRow | null> {
  try {
    const { data, error } = await supabase
      .from("weekly_updates")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (error) return null;
    return (data as WeeklyRow) ?? null;
  } catch {
    return null;
  }
}
