"use client";

// Action items — one full-width bar per item (the WBC/MCG row shape): a
// colored status stripe down the left edge, owner as a colored initials chip
// picked from the real team, and a critical flag that sorts to the top. No
// Ops/Growth split — one flat list.
import { useState, useTransition } from "react";
import { addActionItem, setActionItemDone, removeActionItem, setActionItemCritical } from "@/lib/actions/weekly";
import type { ActionItemRow } from "@/lib/actions/weekly";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ops/Bits";
import CommentThread from "@/components/ops/CommentThread";
import type { EntityComment } from "@/lib/actions/comments";

export interface ActionItemTeamMember {
  id: string;
  name: string;
}

const CHIP_COLORS = ["#02733e", "#8f6413", "#014625", "#7a2626", "#015a30", "#4a3a12"];
function chipColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length];
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

function OwnerChip({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      style={{ background: chipColor(name), width: size, height: size, fontSize: size * 0.42 }}
      className="shrink-0 flex items-center justify-center text-ops-bg font-barlowc font-semibold"
    >
      {initials(name)}
    </span>
  );
}

export default function ActionItemsPanel({
  items,
  team,
  weekStart,
  comments = {},
  onChange,
}: {
  items: ActionItemRow[];
  team: ActionItemTeamMember[];
  weekStart: string;
  comments?: Record<string, EntityComment[]>;
  /** Called after any local mutation, so a parent (e.g. Today) can update its
   *  own open-count badge without a full page reload. */
  onChange?: (items: ActionItemRow[]) => void;
}) {
  const [rows, setRows] = useState(items);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);

  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newCritical, setNewCritical] = useState(false);

  function apply(next: ActionItemRow[]) {
    setRows(next);
    onChange?.(next);
  }

  function toggle(a: ActionItemRow) {
    const done = a.completed_week === weekStart;
    apply(rows.map((x) => (x.id === a.id ? { ...x, completed_week: done ? null : weekStart } : x)));
    start(async () => {
      await setActionItemDone(a.id, weekStart, !done);
    });
  }

  function remove(a: ActionItemRow) {
    apply(rows.filter((x) => x.id !== a.id));
    start(async () => {
      await removeActionItem(a.id);
    });
  }

  function toggleCritical(a: ActionItemRow) {
    const next = !a.critical;
    apply(rows.map((x) => (x.id === a.id ? { ...x, critical: next } : x)));
    start(async () => {
      const r = await setActionItemCritical(a.id, next);
      if (r?.error) { apply(rows.map((x) => (x.id === a.id ? { ...x, critical: !next } : x))); setErr(r.error); }
    });
  }

  function pickOwner(m: ActionItemTeamMember) {
    const deselecting = newOwnerId === m.id;
    setNewOwnerId(deselecting ? null : m.id);
    setNewOwnerName(deselecting ? "" : m.name);
  }

  function add() {
    const owner = newOwnerName.trim();
    const action = newAction.trim();
    if (!owner || !action) return;
    setErr("");
    start(async () => {
      // The section split isn't shown anymore — every item created here just
      // lands in "operations" (the DB column stays for old data / reporting).
      const r = await addActionItem({ owner, ownerId: newOwnerId, action, section: "operations", openedWeek: weekStart, critical: newCritical });
      if ("error" in r && r.error) {
        setErr(r.error);
        return;
      }
      // Real id from the server, so completing or flagging it works without a
      // refresh first.
      if ("item" in r && r.item) apply([...rows, r.item]);
      setNewOwnerId(null);
      setNewOwnerName("");
      setNewAction("");
      setNewCritical(false);
      setAdding(false);
    });
  }

  return (
    <div>
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      {/* Full-width bars, one per item — the same row shape as the WBC dash
          and MCG. A card grid made every item look like its own object to
          consider; a list reads as one thing to work down. */}
      <div className="flex flex-col gap-2">
        {[...rows]
          .sort((a, b) => {
            // Critical to the top, but never above the fold of "done" — a
            // finished item shouldn't jump the queue just for being flagged.
            const aDone = a.completed_week === weekStart, bDone = b.completed_week === weekStart;
            if (aDone !== bDone) return aDone ? 1 : -1;
            if (!!a.critical !== !!b.critical) return a.critical ? -1 : 1;
            return 0;
          })
          .map((a) => {
          const done = a.completed_week === weekStart;
          const carried = a.opened_week !== weekStart && !done;
          const stripe = done ? "rgba(26,26,26,.2)" : a.critical ? "#b03a2e" : carried ? "#7a2626" : "#02733e";
          return (
            <div key={a.id} className="border border-ops-divider bg-ops-bg" style={{ opacity: done ? 0.6 : 1 }}>
              <div className="flex items-stretch">
              <div style={{ background: stripe, width: a.critical && !done ? 8 : 5 }} className="shrink-0" />
              <div className="min-w-0 flex-1 flex items-center gap-3 px-3 py-2.5">
                <button
                  aria-label={done ? "Reopen" : "Complete"}
                  onClick={() => toggle(a)}
                  className={`w-4 h-4 shrink-0 border ${done ? "bg-ops-accent border-ops-accent" : "border-ops-divider"}`}
                />
                <span className={`font-barlow text-[15px] leading-snug flex-1 min-w-0 ${done ? "line-through text-[rgba(26,26,26,.5)]" : ""}`}>
                  {a.critical && !done && (
                    <span className="text-[10.5px] font-barlowc font-semibold uppercase tracking-wider px-1.5 py-0.5 mr-2 align-middle bg-[#b03a2e] text-ops-bg">
                      Critical
                    </span>
                  )}
                  {a.action}
                </span>
                <button
                  onClick={() => toggleCritical(a)}
                  aria-pressed={!!a.critical}
                  title={a.critical ? "Remove critical flag" : "Flag as critical"}
                  className={`shrink-0 text-[15px] leading-none ${a.critical ? "text-[#b03a2e]" : "text-[rgba(26,26,26,.25)] hover:text-[#b03a2e]"}`}
                >
                  ⚑
                </button>
                <span className="flex items-center gap-1.5 shrink-0">
                  <OwnerChip name={a.owner} size={20} />
                  <span className="text-[12.5px] font-barlow text-[rgba(26,26,26,.68)] hidden sm:inline">
                    {a.owner.split(/\s+/)[0]}
                  </span>
                </span>
                <span
                  className="text-[11px] font-barlowc uppercase tracking-[0.06em] shrink-0 w-[74px] text-right hidden sm:block"
                  style={{ color: stripe }}
                >
                  {done ? "Done" : carried ? "Overdue" : "This week"}
                </span>
                <button onClick={() => remove(a)} className="text-[rgba(26,26,26,.35)] hover:text-ops-danger shrink-0">
                  ✕
                </button>
              </div>
              </div>
              {(
                <div className="px-3 pb-2.5 pl-[calc(0.75rem+5px)]">
                  <CommentThread entityType="action_item" entityId={a.id} initial={comments[a.id] ?? []} />
                </div>
              )}
            </div>
          );
        })}

        {/* Add row — same bar footprint as an item */}
        <div className="border border-dashed border-ops-divider p-3">
          {adding ? (
            <div className="space-y-2">
              {team.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {team.map((m) => {
                    const on = newOwnerId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickOwner(m)}
                        className={`flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 border min-h-tap ${
                          on ? "border-ops-accent bg-ops-accent-100" : "border-ops-divider hover:bg-[rgba(26,26,26,.05)]"
                        }`}
                      >
                        <OwnerChip name={m.name} size={16} />
                        <span className="text-[11.5px] font-barlow">{m.name.split(/\s+/)[0]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <input
                value={newOwnerName}
                onChange={(e) => {
                  setNewOwnerName(e.target.value);
                  setNewOwnerId(null);
                }}
                placeholder="Owner (or pick above)"
                className={`${inputCls} w-full`}
              />
              <input
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                placeholder="What needs doing?"
                autoFocus
                className={`${inputCls} w-full`}
              />
              <label className="flex items-center gap-2 cursor-pointer min-h-tap">
                <input
                  type="checkbox"
                  checked={newCritical}
                  onChange={(e) => setNewCritical(e.target.checked)}
                  className="w-4 h-4 accent-[#b03a2e]"
                />
                <span className="text-[13px] font-barlow">Critical</span>
              </label>
              <div className="flex gap-2">
                <button className={btnSecondary} onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button className={`${btnPrimary} flex-1`} disabled={!newOwnerName.trim() || !newAction.trim() || pending} onClick={add}>
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full min-h-tap flex items-center justify-center gap-1.5 text-[14px] font-barlowc font-semibold text-[rgba(26,26,26,.5)] hover:text-ops-text"
            >
              + New action item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
