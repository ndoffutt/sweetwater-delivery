import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneDigits } from "@/lib/messaging";

export const maxDuration = 120;

// Owner-only: import a SPOT customer export (CSV) into message_contacts so
// every past customer resolves to a name in Messages. Deliberately NOT the
// customers table — that stays delivery-only for route building.
//
// Column detection is fuzzy because SPOT exports vary: any header containing
// "name" (or First/Last pair) is the name; the phone is the first column whose
// header mentions cell/mobile/phone, preferring cell/mobile.

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await verifySessionToken(token.value);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("contacts");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No CSV provided" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return NextResponse.json({ error: "That CSV looks empty" }, { status: 422 });

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (pred: (h: string) => boolean) => headers.findIndex(pred);

  const firstIdx = idx((h) => /first\s*name/.test(h));
  const lastIdx = idx((h) => /last\s*name/.test(h));
  const nameIdx = idx((h) => h.includes("name") && !/company|route|file/.test(h));
  const phoneIdxs = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /cell|mobile|phone/.test(h))
    .sort((a, b) => Number(/cell|mobile/.test(b.h)) - Number(/cell|mobile/.test(a.h)))
    .map(({ i }) => i);

  if ((nameIdx < 0 && (firstIdx < 0 || lastIdx < 0)) || phoneIdxs.length === 0) {
    return NextResponse.json(
      { error: `Couldn't find name/phone columns. Headers: ${headers.join(", ")}` },
      { status: 422 }
    );
  }

  // Last row wins per number; skip rows without a usable 10-digit phone.
  const byDigits = new Map<string, { phone_digits: string; name: string }>();
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const name =
      firstIdx >= 0 && lastIdx >= 0
        ? `${cells[firstIdx] ?? ""} ${cells[lastIdx] ?? ""}`.trim()
        : (cells[nameIdx] ?? "").replace(/^([^,]+),\s*(.+)$/, "$2 $1").trim();
    let digits = "";
    for (const pi of phoneIdxs) {
      digits = phoneDigits(cells[pi]);
      if (digits.length === 10) break;
    }
    if (!name || digits.length !== 10) { skipped++; continue; }
    byDigits.set(digits, { phone_digits: digits, name });
  }

  const rows = Array.from(byDigits.values());
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows with a name and 10-digit phone" }, { status: 422 });
  }

  const supabase = createAdminClient();
  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("message_contacts")
      .upsert(chunk, { onConflict: "phone_digits" });
    if (error) {
      return NextResponse.json(
        { error: `Import failed after ${imported} contacts: ${error.message}` },
        { status: 500 }
      );
    }
    imported += chunk.length;
  }

  return NextResponse.json({ imported, skipped });
}
