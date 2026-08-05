"use client";

// Action items — card-per-task grid, MCG's Tasks layout: outlined square card,
// a colored status stripe down the left edge, owner as a colored initials
// chip picked from the real team. No Ops/Growth split — one flat list.
import { useState, useTransition } from "react";
import { addActionItem, setActionItemDone, removeActionItem } from "@/lib/actions/weekly";
import type { ActionItemRow } from "@/lib/actions/weekly";
import { btnPrimary, btnSecondary, inputCls } from "@/components/ops/Bits";

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
  onChange,
}: {
  items: ActionItemRow[];
  team: ActionItemTeamMember[];
  weekStart: string;
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
      const r = await addActionItem({ owner, ownerId: newOwnerId, action, section: "operations", openedWeek: weekStart });
      if (r?.error) {
        setErr(r.error);
        return;
      }
      apply([
        ...rows,
        { id: `tmp-${Date.now()}`, owner, owner_id: newOwnerId, action, section: "operations", opened_week: weekStart, completed_week: null },
      ]);
      setNewOwnerId(null);
      setNewOwnerName("");
      setNewAction("");
      setAdding(false);
    });
  }

  return (
    <div>
      {err && <p className="text-[13px] text-ops-danger mb-3">{err}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((a) => {
          const done = a.completed_week === weekStart;
          const carried = a.opened_week !== weekStart && !done;
          const stripe = done ? "rgba(26,26,26,.2)" : carried ? "#7a2626" : "#02733e";
          return (
            <div key={a.id} className="flex border border-ops-divider bg-ops-bg" style={{ opacity: done ? 0.6 : 1 }}>
              <div style={{ background: stripe }} className="w-[5px] shrink-0" />
              <div className="min-w-0 flex-1 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className={`font-barlow text-[15px] leading-snug ${done ? "line-through text-[rgba(26,26,26,.5)]" : ""}`}>
                    {a.action}
                  </div>
                  <button
                    aria-label={done ? "Reopen" : "Complete"}
                    onClick={() => toggle(a)}
                    className={`mt-0.5 w-4 h-4 shrink-0 border ${done ? "bg-ops-accent border-ops-accent" : "border-ops-divider"}`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2.5">
                  <OwnerChip name={a.owner} size={20} />
                  <span className="text-[12.5px] font-barlow text-[rgba(26,26,26,.68)]">{a.owner.split(/\s+/)[0]}</span>
                  <span className="ml-auto text-[11px] font-barlowc uppercase tracking-[0.06em]" style={{ color: stripe }}>
                    {done ? "Done" : carried ? "Overdue" : "This week"}
                  </span>
                  <button onClick={() => remove(a)} className="text-[rgba(26,26,26,.35)] hover:text-ops-danger">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add card — same footprint as a task card, sits in the grid */}
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
              className="w-full h-full min-h-[64px] flex items-center justify-center gap-1.5 text-[14px] font-barlowc font-semibold text-[rgba(26,26,26,.5)] hover:text-ops-text"
            >
              + New action item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
