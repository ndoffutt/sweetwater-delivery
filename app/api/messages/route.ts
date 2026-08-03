import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { phoneDigits, smsConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export interface ThreadSummary {
  phone: string;
  digits: string;
  name: string | null;
  nameSource: "customer" | "prospect" | "contact" | null;
  customerId: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
  pinned: boolean;
  archived: boolean;
}

interface MessageRow {
  id: string;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  customer_id: string | null;
  sender_name: string | null;
  status: string;
  read_at: string | null;
  created_at: string;
  reply_to_id?: string | null;
  reaction?: string | null;
  media_urls?: string[] | null;
}

// The v2 columns only exist after supabase/messaging_v2.sql has been run.
// Select them optimistically and fall back to the core set, so the inbox keeps
// working on a database that hasn't been migrated yet.
const CORE = "id, direction, phone, body, customer_id, sender_name, status, read_at, created_at";
const V2 = `${CORE}, reply_to_id, reaction, media_urls`;

/** Read messages, preferring the v2 columns and falling back to the core set
 *  when this database hasn't run messaging_v2.sql yet. */
async function fetchMessages(
  supabase: ReturnType<typeof createAdminClient>,
  ascending: boolean,
  limit: number
): Promise<{ rows: MessageRow[]; failed: boolean }> {
  const v2 = await supabase
    .from("messages")
    .select(V2)
    .order("created_at", { ascending })
    .limit(limit);
  if (!v2.error) return { rows: (v2.data ?? []) as unknown as MessageRow[], failed: false };

  const core = await supabase
    .from("messages")
    .select(CORE)
    .order("created_at", { ascending })
    .limit(limit);
  if (core.error) return { rows: [], failed: true };
  return { rows: (core.data ?? []) as unknown as MessageRow[], failed: false };
}

/** Look up display names for phone numbers: customer, then prospect, then a
 *  manually saved contact. Returns a digits -> {name, source, customerId} map. */
async function buildNameMap(supabase: ReturnType<typeof createAdminClient>) {
  const [customers, prospects, contacts] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("active", true)
      .is("deleted_at", null)
      .not("phone", "is", null),
    supabase.from("prospects").select("name, phone").is("deleted_at", null).not("phone", "is", null),
    supabase.from("message_contacts").select("phone_digits, name"),
  ]);

  const map = new Map<
    string,
    { name: string; source: "customer" | "prospect" | "contact"; customerId: string | null }
  >();

  // Lowest priority first so higher-priority sources overwrite.
  for (const c of (contacts.data ?? []) as { phone_digits: string; name: string }[]) {
    map.set(c.phone_digits, { name: c.name, source: "contact", customerId: null });
  }
  for (const p of (prospects.data ?? []) as { name: string; phone: string }[]) {
    map.set(phoneDigits(p.phone), { name: p.name, source: "prospect", customerId: null });
  }
  for (const c of (customers.data ?? []) as { id: string; name: string; phone: string }[]) {
    map.set(phoneDigits(c.phone), { name: c.name, source: "customer", customerId: c.id });
  }
  return map;
}

// GET /api/messages            -> { threads, configured }
// GET /api/messages?phone=...  -> { messages, contact } for one conversation
// GET /api/messages?unread=1   -> { unread } count (for the nav badge)
// GET /api/messages?contacts=1 -> { contacts } for the new-message picker
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  const user = token ? await verifySessionToken(token.value) : null;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { searchParams } = request.nextUrl;

  if (searchParams.get("unread")) {
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "inbound")
      .is("read_at", null);
    return NextResponse.json({ unread: error ? 0 : count ?? 0 });
  }

  // Address book for the "To:" picker on a new message.
  if (searchParams.get("contacts")) {
    const nameMap = await buildNameMap(supabase);
    const contacts = Array.from(nameMap.entries())
      .map(([digits, v]) => ({ digits, name: v.name, source: v.source, customerId: v.customerId }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ contacts });
  }

  const phone = searchParams.get("phone");
  if (phone) {
    const d = phoneDigits(phone);
    const { rows, failed } = await fetchMessages(supabase, true, 1000);
    if (failed) return NextResponse.json({ messages: [], setup: true });

    const messages = rows.filter((m) => phoneDigits(m.phone) === d);
    const nameMap = await buildNameMap(supabase);
    const hit = nameMap.get(d);

    return NextResponse.json({
      messages,
      contact: {
        digits: d,
        name: hit?.name ?? null,
        source: hit?.source ?? null,
        customerId: hit?.customerId ?? null,
      },
    });
  }

  // Thread list: latest 500 messages grouped by number.
  const { rows, failed } = await fetchMessages(supabase, false, 500);
  if (failed) {
    // Table not migrated yet: surface the setup state, not an error.
    return NextResponse.json({ threads: [], setup: true, configured: smsConfigured() });
  }

  const [nameMap, metaRes] = await Promise.all([
    buildNameMap(supabase),
    supabase.from("conversation_meta").select("phone_digits, pinned_at, archived_at"),
  ]);
  const meta = new Map(
    ((metaRes.data ?? []) as { phone_digits: string; pinned_at: string | null; archived_at: string | null }[]).map(
      (m) => [m.phone_digits, m]
    )
  );

  const threads = new Map<string, ThreadSummary>();
  for (const m of rows) {
    const d = phoneDigits(m.phone);
    let t = threads.get(d);
    if (!t) {
      const hit = nameMap.get(d);
      const mt = meta.get(d);
      t = {
        phone: m.phone,
        digits: d,
        name: hit?.name ?? null,
        nameSource: hit?.source ?? null,
        customerId: hit?.customerId ?? m.customer_id,
        lastBody: m.body,
        lastAt: m.created_at,
        lastDirection: m.direction,
        unread: 0,
        pinned: Boolean(mt?.pinned_at),
        archived: Boolean(mt?.archived_at),
      };
      threads.set(d, t);
    }
    if (m.direction === "inbound" && !m.read_at) t.unread++;
  }

  // Pinned first, then most recent.
  const sorted = Array.from(threads.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastAt.localeCompare(a.lastAt);
  });

  return NextResponse.json({ threads: sorted, configured: smsConfigured() });
}
