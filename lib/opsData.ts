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
  archived: boolean;
}

/** The unified message table: one row per phone thread, newest first. */
export async function getThreadTable(supabase: Admin): Promise<ThreadRow[]> {
  type M = { phone: string; direction: "inbound" | "outbound"; body: string | null; created_at: string; reaction?: string | null };
  let msgs: M[] = [];
  try {
    // The live inbox is the v2 `messages` table (messaging_v2.sql). The old
    // text_messages table is only a legacy queue — reading it here left this
    // page empty while real conversations sat in `messages`.
    const { data, error } = await supabase
      .from("messages")
      .select("phone, direction, body, created_at, reaction")
      .order("created_at", { ascending: true })
      .limit(4000);
    if (error) return [];
    msgs = (data ?? []) as M[];
  } catch {
    return [];
  }

  // Name sources.
  const [customers, prospects, meta, contacts, route] = await Promise.all([
    supabase.from("customers").select("id, name, phone").is("deleted_at", null).then((r) => r.data ?? []),
    supabase.from("prospects").select("id, name, phone, priority").is("deleted_at", null).then((r) => r.data ?? []),
    supabase
      .from("conversation_meta")
      .select("phone_digits, archived_at")
      .then((r) => r.data ?? [], () => []),
    (async () => {
      // Paged: the SPOT import put 6k+ rows here and PostgREST caps at 1000.
      const out: { phone_digits: string; name: string }[] = [];
      try {
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("message_contacts")
            .select("phone_digits, name")
            .order("phone_digits")
            .range(from, from + 999);
          if (error || !data) break;
          out.push(...(data as { phone_digits: string; name: string }[]));
          if (data.length < 1000) break;
        }
      } catch { /* partial is fine */ }
      return out;
    })(),
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
  const archivedAtByDigits = new Map<string, string>();
  for (const m of meta as { phone_digits: string; archived_at: string | null }[]) {
    if (m.archived_at) archivedAtByDigits.set(m.phone_digits, m.archived_at);
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
    // waitingSince = the first inbound after the last outbound. Reacting to an
    // inbound message (👍 etc.) counts as dealing with it — the whole point of
    // a thumbs-up is "seen, nothing to say back", so it must clear the wait or
    // the thread nags forever in Needs reply.
    if (m.direction === "outbound") t.waitingSince = null;
    else if (m.reaction) t.waitingSince = null;
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

    // A message newer than the archive timestamp resurfaces the thread — same
    // rule as the Messages inbox, so archiving here and there agree.
    const archivedAt = archivedAtByDigits.get(digits);
    const archived = !!archivedAt && archivedAt > t.lastAt;

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
      archived,
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
  owner_id: string | null;
  critical: boolean;
  action: string;
  section: "operations" | "growth";
  opened_week: string;
  completed_week: string | null;
}

const ACTION_ITEM_CORE = "id, owner, action, section, opened_week, completed_week";
const ACTION_ITEM_V2 = `${ACTION_ITEM_CORE}, owner_id`;
const ACTION_ITEM_V3 = `${ACTION_ITEM_V2}, critical`;

export async function getActionItems(supabase: Admin, weekStart: string): Promise<OpenActionItem[]> {
  try {
    // owner_id lands with ops_hub.sql — select it optimistically and fall
    // back to the core columns on a database that hasn't run it yet.
    let data: unknown[] | null;
    let error: { message: string } | null;
    ({ data, error } = await supabase
      .from("action_items")
      .select(ACTION_ITEM_V3)
      .is("deleted_at", null)
      .or(`completed_week.is.null,completed_week.eq.${weekStart}`)
      .order("opened_week", { ascending: true }));
    if (error) {
      ({ data, error } = await supabase
        .from("action_items")
        .select(ACTION_ITEM_V2)
        .is("deleted_at", null)
        .or(`completed_week.is.null,completed_week.eq.${weekStart}`)
        .order("opened_week", { ascending: true }));
    }
    if (error) {
      ({ data, error } = await supabase
        .from("action_items")
        .select(ACTION_ITEM_CORE)
        .is("deleted_at", null)
        .or(`completed_week.is.null,completed_week.eq.${weekStart}`)
        .order("opened_week", { ascending: true }));
    }
    if (error) return [];
    return ((data ?? []) as unknown as OpenActionItem[]).map((i) => ({ ...i, owner_id: i.owner_id ?? null, critical: i.critical ?? false }));
  } catch {
    return [];
  }
}

export interface CustomerIssue {
  id: string;
  description: string;
  customer_name: string | null;
  opened_week: string;
  resolved_week: string | null;
}

/** Everything still open, plus whatever was closed during this week — so a
 *  past week's update still shows what it resolved rather than only what's
 *  outstanding today. */
export async function getCustomerIssues(supabase: Admin, weekStart: string): Promise<CustomerIssue[]> {
  try {
    const { data, error } = await supabase
      .from("customer_issues")
      .select("id, description, customer_name, opened_week, resolved_week")
      .is("deleted_at", null)
      .or(`resolved_week.is.null,resolved_week.eq.${weekStart}`)
      .order("opened_week", { ascending: true });
    if (error) return [];
    return (data ?? []) as CustomerIssue[];
  } catch {
    return [];
  }
}

export interface TeamMember {
  id: string;
  name: string;
  role: "driver" | "dispatcher" | "admin";
}

/** Active team members, for the action-item owner picker. */
export async function getTeamMembers(supabase: Admin): Promise<TeamMember[]> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, role")
      .is("deleted_at", null)
      .eq("active", true)
      .order("name");
    if (error) return [];
    return (data ?? []) as TeamMember[];
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
