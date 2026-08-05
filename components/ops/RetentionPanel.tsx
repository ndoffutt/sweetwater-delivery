"use client";

// Customer retention on the weekly update.
//
// Two lists, not one: a customer who stopped entirely and a customer still
// coming but spending far less are different calls — "we haven't seen you"
// versus "we're only getting part of your business" — and lumping them
// together hid that the reduced group is where most of the money actually is.
//
// Ranked by dollars gone rather than by what they used to spend, because the
// question the list answers is "who is worth calling this week".
import { useState, useTransition } from "react";
import { setRetentionStatus } from "@/lib/actions/comments";
import CommentThread from "@/components/ops/CommentThread";
import type { EntityComment } from "@/lib/actions/comments";
import { Tag } from "@/components/ops/Bits";

export interface RetentionRow {
  id: string;
  customer_name: string;
  customer_id: string | null;
  first_seen: string | null;
  last_seen: string | null;
  orders: number | null;
  spend_2024: number | null;
  spend_2025: number | null;
  spend_2026: number | null;
  status: string;
  snapshot_at: string;
  category: string;
  reason: string | null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const STATUSES = ["open", "working", "recovered", "dismissed"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Not contacted", working: "Working", recovered: "Recovered", dismissed: "Dismissed",
};
/** What we've stopped collecting this year. */
const gone = (r: RetentionRow) => Math.max(0, (r.spend_2025 ?? 0) - (r.spend_2026 ?? 0));

const SHOWN = 5;

function Row({
  r,
  comments,
  onStatus,
}: {
  r: RetentionRow;
  comments: EntityComment[];
  onStatus: (id: string, s: (typeof STATUSES)[number]) => void;
}) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-barlow text-[14.5px] font-medium">{r.customer_name}</span>
        {r.status !== "open" && <Tag tone={r.status === "recovered" ? "accent" : "gold"}>{STATUS_LABEL[r.status]}</Tag>}
        <span className="ml-auto font-barlowc text-[13px] tabular-nums text-ops-danger">−{money(gone(r))}</span>
      </div>

      <div className="text-[12px] font-barlow text-[rgba(26,26,26,.55)] mt-0.5">
        2024 {money(r.spend_2024 ?? 0)} · 2025 {money(r.spend_2025 ?? 0)} · 2026 {money(r.spend_2026 ?? 0)}
        {r.orders ? ` · ${r.orders} orders` : ""}
        {r.last_seen ? ` · last seen ${r.last_seen}` : ""}
      </div>

      {r.reason && (
        <p className="font-barlow text-[13px] text-[rgba(26,26,26,.68)] mt-1 leading-snug">{r.reason}</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {STATUSES.filter((sv) => sv !== r.status).map((sv) => (
          <button
            key={sv}
            onClick={() => onStatus(r.id, sv)}
            className="text-[11px] font-barlowc uppercase tracking-[0.06em] border border-ops-divider px-2 py-1 hover:bg-[rgba(26,26,26,.05)] min-h-tap"
          >
            {STATUS_LABEL[sv]}
          </button>
        ))}
      </div>

      <CommentThread entityType="retention" entityId={r.id} initial={comments} />
    </div>
  );
}

export default function RetentionPanel({
  rows: initial,
  comments = {},
}: {
  rows: RetentionRow[];
  comments?: Record<string, EntityComment[]>;
}) {
  const [rows, setRows] = useState(initial);
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();

  function onStatus(id: string, status: (typeof STATUSES)[number]) {
    setRows((cur) =>
      status === "dismissed" ? cur.filter((r) => r.id !== id) : cur.map((r) => (r.id === id ? { ...r, status } : r))
    );
    start(async () => {
      const r = await setRetentionStatus(id, status);
      if (r?.error) { setErr(r.error); setRows(initial); }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)] mt-4">
        Nothing on the retention list. Import a call sheet to populate it.
      </p>
    );
  }

  const groups = [
    { key: "lost", title: "Lost", blurb: "Nothing at all this year" },
    { key: "reduced", title: "Reduced", blurb: "Still ordering, well below last year" },
  ];
  const totalGone = rows.reduce((n, r) => n + gone(r), 0);

  return (
    <div className="mt-4">
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      <p className="text-[15px] mb-4">
        <b>{rows.length}</b> accounts · <b className="text-ops-danger">{money(totalGone)}</b> of last year&apos;s
        business not coming in
      </p>

      <div className="space-y-6">
        {groups.map((g) => {
          const set = rows.filter((r) => r.category === g.key).sort((a, b) => gone(b) - gone(a));
          if (set.length === 0) return null;
          const all = !!showAll[g.key];
          const visible = all ? set : set.slice(0, SHOWN);
          const groupGone = set.reduce((n, r) => n + gone(r), 0);
          return (
            <div key={g.key}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-barlowc font-semibold uppercase tracking-[0.06em] text-[15px]">{g.title}</h3>
                  <span className="font-barlow text-[12.5px] text-[rgba(26,26,26,.5)]">{g.blurb}</span>
                </div>
                <span className="font-barlow text-[13px] text-[rgba(26,26,26,.62)]">
                  {set.length} · <b className="text-ops-danger">−{money(groupGone)}</b>
                </span>
              </div>

              <div className="border border-ops-divider divide-y divide-ops-divider">
                {visible.map((r) => (
                  <Row key={r.id} r={r} comments={comments[r.id] ?? []} onStatus={onStatus} />
                ))}
              </div>

              {set.length > SHOWN && (
                <button
                  onClick={() => setShowAll((s) => ({ ...s, [g.key]: !all }))}
                  className="mt-2 text-[12px] font-barlowc uppercase tracking-[0.06em] text-ops-accent"
                >
                  {all ? `Show top ${SHOWN} only` : `Show all ${set.length}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
