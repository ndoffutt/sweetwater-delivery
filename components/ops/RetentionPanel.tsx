"use client";

// Customer retention on the weekly update: accounts that used to spend and
// have gone quiet. Sorted by what they were worth, because the point of the
// list is deciding who's worth a phone call this week.
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
}

const money = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);
const STATUSES = ["open", "working", "recovered", "dismissed"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Not contacted", working: "Working", recovered: "Recovered", dismissed: "Dismissed",
};

function monthsSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso + "T12:00:00").getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / (30.44 * 86_400_000)));
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
  const [, start] = useTransition();

  function setStatus(id: string, status: (typeof STATUSES)[number]) {
    const prev = rows.find((r) => r.id === id)?.status;
    setRows((cur) =>
      status === "dismissed" ? cur.filter((r) => r.id !== id) : cur.map((r) => (r.id === id ? { ...r, status } : r))
    );
    start(async () => {
      const r = await setRetentionStatus(id, status);
      if (r?.error) {
        setErr(r.error);
        if (prev) setRows(initial);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)] mt-4">
        Nothing on the retention list. Import a SPOT retention export to populate it.
      </p>
    );
  }

  // What's actually at stake, so the section leads with a number.
  const atRisk = rows.reduce((n, r) => n + (r.spend_2025 ?? 0), 0);
  const stale = monthsSince(rows[0]?.snapshot_at?.slice(0, 10) ?? null);

  return (
    <div className="mt-4">
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      <p className="text-[15px] mb-3">
        <b>{rows.length}</b> lapsed {rows.length === 1 ? "account" : "accounts"}
        <span className="ml-6">Last year&apos;s spend at risk <b>{money(atRisk)}</b></span>
        {stale != null && stale >= 1 && (
          <span className="ml-6 text-[13px] text-ops-gold-deep">figures {stale}mo old</span>
        )}
      </p>

      <div className="border border-ops-divider divide-y divide-ops-divider">
        {rows.map((r) => {
          const gone = monthsSince(r.last_seen);
          const peak = Math.max(r.spend_2024 ?? 0, r.spend_2025 ?? 0, r.spend_2026 ?? 0);
          return (
            <div key={r.id} className="px-3 py-2.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-barlow text-[14.5px] font-medium">{r.customer_name}</span>
                {r.status !== "open" && <Tag tone={r.status === "recovered" ? "accent" : "gold"}>{STATUS_LABEL[r.status]}</Tag>}
                <span className="ml-auto font-barlowc text-[13px] tabular-nums">{money(peak)}</span>
              </div>

              <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap mt-1 text-[12px] font-barlow text-[rgba(26,26,26,.55)]">
                <span>{r.orders ?? 0} orders</span>
                <span>
                  2024 {money(r.spend_2024)} · 2025 {money(r.spend_2025)} · 2026 {money(r.spend_2026)}
                </span>
                {r.last_seen && (
                  <span className={gone != null && gone >= 6 ? "text-ops-danger" : ""}>
                    last seen {r.last_seen}{gone != null ? ` · ${gone}mo ago` : ""}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {STATUSES.filter((sv) => sv !== r.status).map((sv) => (
                  <button
                    key={sv}
                    onClick={() => setStatus(r.id, sv)}
                    className="text-[11px] font-barlowc uppercase tracking-[0.06em] border border-ops-divider px-2 py-1 hover:bg-[rgba(26,26,26,.05)] min-h-tap"
                  >
                    {STATUS_LABEL[sv]}
                  </button>
                ))}
              </div>

              <CommentThread entityType="retention" entityId={r.id} initial={comments[r.id] ?? []} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
