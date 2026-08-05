"use client";

// Customer issues on the weekly update. Written in by the manager each week
// rather than derived from the delivery exception log — the ones that matter
// (a complaint on the phone, a damaged garment, a billing dispute) never touch
// the app. Anything left unresolved carries into next week automatically.
import { useState, useTransition } from "react";
import { addCustomerIssue, setCustomerIssueResolved, removeCustomerIssue } from "@/lib/actions/weekly";
import type { CustomerIssueRow } from "@/lib/actions/weekly";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ops/Bits";
import CommentThread from "@/components/ops/CommentThread";
import type { EntityComment } from "@/lib/actions/comments";

export default function CustomerIssuesPanel({
  issues,
  weekStart,
  comments = {},
}: {
  issues: CustomerIssueRow[];
  weekStart: string;
  comments?: Record<string, EntityComment[]>;
}) {
  const [rows, setRows] = useState(issues);
  const [, start] = useTransition();
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [who, setWho] = useState("");
  const [what, setWhat] = useState("");
  // Closing an issue asks how — so `resolving` holds the id being closed
  // while its reason is typed.
  const [resolving, setResolving] = useState<string | null>(null);
  const [why, setWhy] = useState("");

  function toggle(i: CustomerIssueRow) {
    if (!i.resolved_week) {
      // Opening the reason box rather than resolving straight away.
      setResolving(i.id);
      setWhy("");
      return;
    }
    setRows((cur) => cur.map((x) => (x.id === i.id ? { ...x, resolved_week: null, resolution: null } : x)));
    start(async () => { await setCustomerIssueResolved(i.id, weekStart, false); });
  }

  function confirmResolve(i: CustomerIssueRow) {
    const reason = why.trim();
    if (!reason) return;
    setErr("");
    start(async () => {
      const r = await setCustomerIssueResolved(i.id, weekStart, true, reason);
      if (r?.error) { setErr(r.error); return; }
      setRows((cur) => cur.map((x) => (x.id === i.id ? { ...x, resolved_week: weekStart, resolution: reason } : x)));
      setResolving(null);
      setWhy("");
    });
  }

  function remove(i: CustomerIssueRow) {
    setRows((cur) => cur.filter((x) => x.id !== i.id));
    start(async () => { await removeCustomerIssue(i.id); });
  }

  function add() {
    const description = what.trim();
    if (!description) return;
    setErr("");
    start(async () => {
      const r = await addCustomerIssue({ description, customerName: who.trim() || null, openedWeek: weekStart });
      if (r?.error) { setErr(r.error); return; }
      setRows((cur) => [
        ...cur,
        { id: `tmp-${cur.length}-${description.length}`, description, customer_name: who.trim() || null, opened_week: weekStart, resolved_week: null, resolution: null },
      ]);
      setWho("");
      setWhat("");
      setAdding(false);
    });
  }

  const open = rows.filter((r) => !r.resolved_week);
  const carried = open.filter((r) => r.opened_week !== weekStart);

  return (
    <div className="mt-4">
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      <div className="flex items-center gap-4 mb-3 font-barlow text-[13px] text-[rgba(26,26,26,.62)]">
        <span><b className="text-ops-text">{open.length}</b> open</span>
        <span><b className="text-ops-text">{rows.filter((r) => r.resolved_week === weekStart).length}</b> resolved this week</span>
        {carried.length > 0 && <span className="text-ops-danger">{carried.length} carried over</span>}
      </div>

      {rows.length === 0 ? (
        <p className="font-barlow text-[14px] text-[rgba(26,26,26,.5)] mb-3">
          No issues logged for this week yet.
        </p>
      ) : (
        <div className="border border-ops-divider divide-y divide-ops-divider mb-3">
          {rows.map((i) => {
            const done = !!i.resolved_week;
            const isCarried = !done && i.opened_week !== weekStart;
            return (
              <div key={i.id} className="flex items-start gap-3 px-3 py-2.5" style={{ opacity: done ? 0.55 : 1 }}>
                <button
                  aria-label={done ? "Reopen" : "Mark resolved"}
                  onClick={() => toggle(i)}
                  className={`mt-0.5 w-4 h-4 shrink-0 border ${done ? "bg-ops-accent border-ops-accent" : "border-ops-divider"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className={`font-barlow text-[14.5px] leading-snug ${done ? "line-through text-[rgba(26,26,26,.5)]" : ""}`}>
                    {i.customer_name && <b>{i.customer_name} — </b>}
                    {i.description}
                  </div>
                  <div className="text-[11px] font-barlowc uppercase tracking-[0.06em] mt-1 text-[rgba(26,26,26,.45)]">
                    {done ? "Resolved" : isCarried ? `Carried from ${i.opened_week}` : "New this week"}
                  </div>
                  {done && i.resolution && (
                    <p className="font-barlow text-[13px] text-[rgba(26,26,26,.62)] mt-1">
                      <span className="text-ops-accent">✓</span> {i.resolution}
                    </p>
                  )}
                  {resolving === i.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={why}
                        onChange={(e) => setWhy(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmResolve(i); } }}
                        placeholder="How was it resolved?"
                        autoFocus
                        className={`${inputCls} flex-1`}
                      />
                      <button className={btnSecondary} onClick={() => setResolving(null)}>Cancel</button>
                      <button className={btnPrimary} disabled={!why.trim()} onClick={() => confirmResolve(i)}>Resolve</button>
                    </div>
                  )}
                  {!i.id.startsWith("tmp-") && (
                    <CommentThread entityType="customer_issue" entityId={i.id} initial={comments[i.id] ?? []} />
                  )}
                </div>
                <button onClick={() => remove(i)} className="text-[rgba(26,26,26,.35)] hover:text-ops-danger shrink-0">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="border border-dashed border-ops-divider p-3 space-y-2">
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Customer (optional)" className={`${inputCls} w-full`} />
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What happened?" autoFocus className={`${inputCls} w-full`} />
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={() => setAdding(false)}>Cancel</button>
            <button className={`${btnPrimary} flex-1`} disabled={!what.trim()} onClick={add}>Add issue</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border border-dashed border-ops-divider py-2.5 text-[14px] font-barlowc font-semibold text-[rgba(26,26,26,.5)] hover:text-ops-text min-h-tap"
        >
          + Add issue
        </button>
      )}
    </div>
  );
}
