import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { phoneDigits, smsConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export interface ThreadSummary {
  phone: string;
  digits: string;
  customerName: string | null;
  customerId: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
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
}

// GET /api/messages            -> { threads, configured }
// GET /api/messages?phone=...  -> { messages } for one conversation
// GET /api/messages?unread=1   -> { unread } count (for the nav badge)
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

  const phone = searchParams.get("phone");
  if (phone) {
    const d = phoneDigits(phone);
    const { data, error } = await supabase
      .from("messages")
      .select("id, direction, phone, body, customer_id, sender_name, status, read_at, created_at")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) return NextResponse.json({ messages: [], setup: true });
    const messages = ((data ?? []) as MessageRow[]).filter((m) => phoneDigits(m.phone) === d);
    return NextResponse.json({ messages });
  }

  // Thread list: latest 500 messages grouped by number, joined to customers.
  const [{ data, error }, { data: customers }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, direction, phone, body, customer_id, sender_name, status, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("active", true)
      .is("deleted_at", null)
      .not("phone", "is", null),
  ]);
  if (error) {
    // Table not migrated yet: surface the setup state, not an error.
    return NextResponse.json({ threads: [], setup: true, configured: smsConfigured() });
  }

  const byDigits = new Map(
    ((customers ?? []) as { id: string; name: string; phone: string }[]).map((c) => [
      phoneDigits(c.phone),
      c,
    ])
  );

  const threads = new Map<string, ThreadSummary>();
  for (const m of (data ?? []) as MessageRow[]) {
    const d = phoneDigits(m.phone);
    let t = threads.get(d);
    if (!t) {
      const cust = byDigits.get(d);
      t = {
        phone: m.phone,
        digits: d,
        customerName: cust?.name ?? null,
        customerId: cust?.id ?? m.customer_id,
        lastBody: m.body,
        lastAt: m.created_at,
        lastDirection: m.direction,
        unread: 0,
      };
      threads.set(d, t);
    }
    if (m.direction === "inbound" && !m.read_at) t.unread++;
  }

  return NextResponse.json({
    threads: Array.from(threads.values()),
    configured: smsConfigured(),
  });
}
