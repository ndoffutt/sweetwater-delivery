import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await verifySessionToken(token.value);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .eq("active", true)
    .is("deleted_at", null)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers });
}
