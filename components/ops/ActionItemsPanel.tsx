"use client";

// Action items — structured the way MCG's Tasks module does it: the owner is
// a real person picked from the team (colored initials chip), not free text.
// Square, not round — Sweetwater's blueprint system has no rounded corners.
import { useState, useTransition } from "react";
import { addActionItem, setActionItemDone, removeActionItem } from "@/lib/actions/weekly";
import type { ActionItemRow } from "@/lib/actions/weekly";
import { btnSecondary, inputCls } from "@/components/ops/Bits";

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

function OwnerChip({ name, size = 22 }: { name: string; size?: number }) {
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

  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newSection, setNewSection] = useState<"operations" | "growth">("operations");

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
      const r = await addActionItem({ owner, ownerId: newOwnerId, action, section: newSection, openedWeek: weekStart });
      if (r?.error) {
        setErr(r.error);
        return;
      }
      apply([
        ...rows,
        { id: `tmp-${Date.now()}`, owner, owner_id: newOwnerId, action, section: newSection, opened_week: weekStart, completed_week: null },
      ]);
      setNewOwnerId(null);
      setNewOwnerName("");
      setNewAction("");
    });
  }

  return (
    <div>
      {err && <p className="text-[13px] text-ops-danger mb-2">{err}</p>}
      {rows.length === 0 ? (
        <p className="text-[14px] text-[rgba(26,26,26,.62)] py-2">Nothing open.</p>
      ) : (
        rows.map((a) => {
          const done = a.completed_week === weekStart;
          const carried = a.opened_week !== weekStart && !done;
          return (
            <div key={a.id} className="border-b border-ops-hairline py-3 flex items-start gap-3">
              <button
                aria-label={done ? "Reopen" : "Complete"}
                onClick={() => toggle(a)}
                className={`mt-0.5 w-4 h-4 shrink-0 border ${done ? "bg-ops-accent border-ops-accent" : "border-ops-divider"}`}
              />
              <OwnerChip name={a.owner} />
              <div className="min-w-0 flex-1">
                <div className={`text-[15px] ${done ? "line-through text-[rgba(26,26,26,.5)]" : ""}`}>{a.action}</div>
                <div className="text-[12.5px] mt-0.5 flex items-center gap-2">
                  <span className="text-[rgba(26,26,26,.62)]">{a.owner}</span>
                  {done ? (
                    <span className="text-ops-accent">Completed — drops off next week</span>
                  ) : carried ? (
                    <span className="text-ops-danger">
                      Overdue · carried since {new Date(a.opened_week + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-[rgba(26,26,26,.5)]">This week</span>
                  )}
                </div>
              </div>
              <button onClick={() => remove(a)} className="text-[rgba(26,26,26,.4)] hover:text-ops-danger shrink-0">
                ✕
              </button>
            </div>
          );
        })
      )}

      <div className="mt-3">
        {team.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {team.map((m) => {
              const on = newOwnerId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickOwner(m)}
                  className={`flex items-center gap-1.5 pl-1 pr-2 py-1 border min-h-tap ${
                    on ? "border-ops-accent bg-ops-accent-100" : "border-ops-divider hover:bg-[rgba(26,26,26,.05)]"
                  }`}
                >
                  <OwnerChip name={m.name} size={18} />
                  <span className="text-[12.5px] font-barlow">{m.name.split(/\s+/)[0]}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={newOwnerName}
            onChange={(e) => {
              setNewOwnerName(e.target.value);
              setNewOwnerId(null);
            }}
            placeholder="Owner"
            className={`${inputCls} w-[110px]`}
          />
          <input
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            placeholder="Action"
            className={`${inputCls} flex-1 min-w-[140px]`}
          />
          <select
            value={newSection}
            onChange={(e) => setNewSection(e.target.value as "operations" | "growth")}
            className={`${inputCls} w-[92px]`}
          >
            <option value="operations">Ops</option>
            <option value="growth">Growth</option>
          </select>
          <button className={btnSecondary} disabled={!newOwnerName.trim() || !newAction.trim() || pending} onClick={add}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
