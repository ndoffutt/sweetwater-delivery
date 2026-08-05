"use client";

// Growth on the weekly update: what outreach actually happened this week.
//
// A comment here is written back to the prospect as a `note` touchpoint, so it
// lands in the Prospects log and the prospect's own history rather than living
// only inside one week's update. Notes don't count as contact anywhere else,
// so adding context can't quietly reset a prospect's check-in clock.
import { useState, useTransition } from "react";
import Link from "next/link";
import { addTouchpointNote } from "@/lib/actions/comments";
import { Tag, btnPrimary, inputCls } from "@/components/ops/Bits";

export interface WeekTouchpointRow {
  id: string;
  prospect_id: string;
  prospect_name: string;
  type: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  visit: "Visit", call: "Call", delivery: "Delivery", email: "Email", text: "Text", note: "Note",
};
const TYPE_TONE: Record<string, "accent" | "gold" | "neutral"> = {
  visit: "accent", call: "accent", delivery: "gold",
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function GrowthTouchpoints({
  touchpoints,
  activeOpportunities,
}: {
  touchpoints: WeekTouchpointRow[];
  activeOpportunities: number;
}) {
  const [rows, setRows] = useState(touchpoints);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function post(prospectId: string) {
    const t = body.trim();
    if (!t) return;
    setErr("");
    start(async () => {
      const r = await addTouchpointNote(prospectId, t);
      if ("error" in r && r.error) { setErr(r.error); return; }
      if ("note" in r && r.note) {
        const name = rows.find((x) => x.prospect_id === prospectId)?.prospect_name ?? "Prospect";
        setRows((cur) => [
          { id: r.note.id, prospect_id: prospectId, prospect_name: name, type: "note", note: r.note.note, created_by: r.note.created_by, created_at: r.note.created_at },
          ...cur,
        ]);
      }
      setBody("");
      setOpenFor(null);
    });
  }

  const reached = rows.filter((t) => t.type !== "note").length;

  return (
    <div className="mt-4">
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      <p className="text-[15px] mb-4">
        Active opportunities <b>{activeOpportunities}</b>
        <span className="ml-6">Reached this week <b>{reached}</b></span>
      </p>

      {rows.length === 0 ? (
        <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)]">
          No touchpoints logged this week yet.
        </p>
      ) : (
        <div className="border border-ops-divider divide-y divide-ops-divider">
          {rows.map((t) => (
            <div key={t.id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <Link
                  href={`/prospects/list?id=${t.prospect_id}`}
                  className="font-barlow text-[14.5px] underline underline-offset-2 decoration-[rgba(26,26,26,.2)] hover:decoration-[rgba(26,26,26,.6)]"
                >
                  {t.prospect_name}
                </Link>
                <Tag tone={TYPE_TONE[t.type] ?? "neutral"}>{TYPE_LABEL[t.type] ?? t.type}</Tag>
                <span className="text-[12px] font-barlow text-[rgba(26,26,26,.45)] ml-auto">
                  {t.created_by ? `${t.created_by} · ` : ""}{day(t.created_at)}
                </span>
              </div>
              {t.note && (
                <p className="font-barlow text-[13.5px] text-[rgba(26,26,26,.68)] mt-1 leading-snug">{t.note}</p>
              )}

              {openFor === t.id ? (
                <div className="flex gap-2 mt-2">
                  <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); post(t.prospect_id); } }}
                    placeholder="Adds a note to this prospect…"
                    autoFocus
                    className={`${inputCls} flex-1`}
                  />
                  <button className={btnPrimary} disabled={!body.trim() || pending} onClick={() => post(t.prospect_id)}>
                    Post
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setOpenFor(t.id); setBody(""); }}
                  className="mt-1 text-[11.5px] font-barlowc uppercase tracking-[0.06em] text-[rgba(26,26,26,.45)] hover:text-ops-text"
                >
                  Comment
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
