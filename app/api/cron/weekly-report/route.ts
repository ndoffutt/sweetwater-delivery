// Weekly delivery recap email. Fires Friday 8am Eastern (12:00 UTC EDT -
// drifts to 7am in winter; a 1-hour DST drift is acceptable). Covers every
// stop completed in the trailing 7 days, with the proof-of-delivery photos.
//
// Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
// Manual replay: GET /api/cron/weekly-report?start=YYYY-MM-DD&end=YYYY-MM-DD
// (with the same Bearer header). Add &dry=1 to render without sending.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RECIPIENTS = [
  "admin@sweetwaterscleaners.com",
  "manager@sweetwaterscleaners.com",
];

const TZ = "America/New_York";

interface StopRow {
  id: string;
  has_dropoff: boolean;
  has_pickup: boolean;
  completed_at: string | null;
  customer: { name: string; address: string } | null;
  photos: { storage_path: string }[] | null;
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Date window: explicit override, else trailing 7 days.
  const qStart = req.nextUrl.searchParams.get("start");
  const qEnd = req.nextUrl.searchParams.get("end");
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  let sinceIso: string;
  let untilIso: string | null = null;
  if (qStart && /^\d{4}-\d{2}-\d{2}$/.test(qStart)) {
    sinceIso = new Date(`${qStart}T00:00:00-12:00`).toISOString();
    untilIso = qEnd && /^\d{4}-\d{2}-\d{2}$/.test(qEnd)
      ? new Date(`${qEnd}T23:59:59+14:00`).toISOString()
      : null;
  } else {
    sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  let query = supabase
    .from("route_stops")
    .select(
      "id, has_dropoff, has_pickup, completed_at, customer:customers(name, address), photos:stop_photos(storage_path)"
    )
    .eq("status", "completed")
    .gte("completed_at", sinceIso)
    .order("completed_at", { ascending: true });
  if (untilIso) query = query.lte("completed_at", untilIso);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stops = ((data ?? []) as unknown as StopRow[]).filter(
    (s) => s.completed_at
  );

  const rangeLabel = `${new Date(sinceIso).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
  })} – ${new Date(untilIso ?? Date.now()).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;

  // Public URL for each proof photo (stop-photos bucket is public).
  const photoUrl = (path: string) =>
    supabase.storage.from("stop-photos").getPublicUrl(path).data.publicUrl;

  // Group stops by Eastern calendar day.
  const byDay = new Map<string, StopRow[]>();
  for (const s of stops) {
    const day = fmtDay(s.completed_at!);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s);
  }

  const totalPhotos = stops.reduce((n, s) => n + (s.photos?.length ?? 0), 0);

  const daySections = Array.from(byDay.entries())
    .map(([day, dayStops]) => {
      const rows = dayStops
        .map((s) => {
          const badges = [
            s.has_dropoff
              ? `<span style="display:inline-block;background:#02733e;color:#FAF7F2;font-size:11px;padding:2px 8px;border-radius:10px;margin-right:6px">↓ Drop-off</span>`
              : "",
            s.has_pickup
              ? `<span style="display:inline-block;background:#d59a29;color:#1A1A1A;font-size:11px;padding:2px 8px;border-radius:10px">↑ Pick-up</span>`
              : "",
          ].join("");
          const photos = (s.photos ?? [])
            .map(
              (p) =>
                `<a href="${photoUrl(p.storage_path)}"><img src="${photoUrl(
                  p.storage_path
                )}" width="120" height="120" style="object-fit:cover;border-radius:8px;margin:4px 4px 0 0;border:1px solid #F0EBE1" alt="Proof photo"/></a>`
            )
            .join("");
          return `
            <tr><td style="padding:14px 0;border-bottom:1px solid #F0EBE1">
              <div style="font-weight:600;color:#1A1A1A;font-size:15px">${esc(
                s.customer?.name ?? "Unknown"
              )}</div>
              <div style="color:#888;font-size:13px;margin:2px 0 6px">${esc(
                s.customer?.address ?? ""
              )} · ${fmtTime(s.completed_at!)}</div>
              <div>${badges}</div>
              ${photos ? `<div style="margin-top:6px">${photos}</div>` : ""}
            </td></tr>`;
        })
        .join("");
      return `
        <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#02733e;margin:24px 0 4px">${day}</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
    })
    .join("");

  const html = `
    <div style="max-width:680px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAF7F2">
      <div style="background:#02733e;padding:20px 24px">
        <div style="color:#FAF7F2;font-size:22px;font-weight:300;font-family:Georgia,serif">Sweetwater's Delivery</div>
        <div style="color:#d59a29;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-top:2px">Weekly Recap</div>
      </div>
      <div style="padding:20px 24px">
        <p style="font-size:13px;color:#888;margin:0 0 2px">${rangeLabel}</p>
        <p style="font-size:22px;font-weight:700;color:#1A1A1A;margin:0">
          ${stops.length} stop${stops.length === 1 ? "" : "s"} completed${
    totalPhotos ? ` · ${totalPhotos} photo${totalPhotos === 1 ? "" : "s"}` : ""
  }
        </p>
        ${daySections || `<p style="color:#888;margin-top:24px">No stops were completed this week.</p>`}
        <p style="font-size:11px;color:#aaa;margin-top:32px;padding-top:16px;border-top:1px solid #F0EBE1">
          Automated weekly recap from the Sweetwater's Delivery app: every stop completed in the last 7 days, sent Friday 8am ET.
        </p>
      </div>
    </div>`;

  if (dry) {
    if (req.nextUrl.searchParams.get("preview") === "1") {
      return new NextResponse(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json({ status: "dry-run", stops: stops.length, photos: totalPhotos, range: rangeLabel });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  // Optional ?to=a@x.com,b@y.com override (gated behind CRON_SECRET) for tests.
  const toOverride = req.nextUrl.searchParams.get("to");
  const recipients = toOverride
    ? toOverride.split(",").map((s) => s.trim()).filter((s) => s.includes("@"))
    : RECIPIENTS;

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Sweetwater's Delivery <admin@sweetwaterscleaners.com>",
    to: recipients,
    subject: `Sweetwater's Weekly: ${stops.length} stop${stops.length === 1 ? "" : "s"} (${rangeLabel})`,
    html,
  });

  if (result.error) {
    return NextResponse.json(
      { status: "failed", error: result.error.message ?? "Resend error" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "sent",
    stops: stops.length,
    photos: totalPhotos,
    recipients: RECIPIENTS,
    id: result.data?.id ?? null,
  });
}
