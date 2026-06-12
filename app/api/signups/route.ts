// Receives a new delivery signup from the website and queues it for the
// manager to review. Authenticated with a shared secret (x-signup-secret).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-signup-secret");
  if (!secret || secret !== process.env.SIGNUP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const address = String(body.address ?? "").trim();
  if (!fullName || !address) {
    return NextResponse.json({ error: "Missing name or address" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("customer_signups").insert({
    full_name: fullName,
    address,
    phone: body.phone ? String(body.phone).trim() : null,
    email: body.email ? String(body.email).trim() : null,
    start_date: body.startDate ? String(body.startDate).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
