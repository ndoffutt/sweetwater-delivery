// Tiny connectivity probe. The driver app hits this before any refresh:
// navigator.onLine reads "online" on a phone attached to a tower with no
// usable throughput, so a real round trip is the only honest signal. Kept
// free of any DB work so it answers instantly and can't fail for reasons
// unrelated to connectivity.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
