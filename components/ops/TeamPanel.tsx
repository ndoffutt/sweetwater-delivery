"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamMember,
  setTeamMemberPin,
  renameTeamMember,
  setTeamMemberActive,
  removeTeamMember,
} from "@/lib/actions/team";
import PushToggle from "@/components/PushToggle";
import { SubNav, Tag, Kicker, btnPrimary, btnSecondary, btnGhost, inputCls } from "@/components/ops/Bits";
import type { OpsTagTone } from "@/components/ops/Bits";

export interface TeamMember {
  id: string;
  name: string;
  role: "driver" | "dispatcher" | "admin";
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface DeletionEntry {
  id: string;
  table_name: string;
  row_id: string;
  before_state: Record<string, unknown>;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
}

const TABLE_LABEL: Record<string, string> = {
  customers: "Customer",
  prospects: "Prospect",
  prospect_touchpoints: "Touchpoint",
  routes: "Route",
  route_stops: "Route stop",
  route_prospect_visits: "Prospect visit",
  stop_photos: "Photo",
  text_messages: "Text message",
  users: "Team member",
};

function deletionTitle(entry: DeletionEntry): string {
  const s = entry.before_state ?? {};
  switch (entry.table_name) {
    case "customers":
    case "prospects":
    case "users":
      return (s.name as string) || "Untitled";
    case "routes":
      return (s.date as string) ? `Route on ${s.date}` : "Route";
    case "route_stops":
      return (s.customer_name as string) || "Stop";
    case "route_prospect_visits":
      return "Prospect visit";
    case "prospect_touchpoints": {
      const type = (s.type as string) ?? "touch";
      const note = (s.note as string) ?? "";
      return note ? `${type[0].toUpperCase()}${type.slice(1)}: ${note.slice(0, 60)}` : `${type[0].toUpperCase()}${type.slice(1)}`;
    }
    case "stop_photos":
      return "Photo";
    case "text_messages":
      return (s.body as string)?.slice(0, 60) ?? "Text message";
    default:
      return entry.table_name;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ROLE_LABEL: Record<TeamMember["role"], string> = {
  driver: "Driver",
  dispatcher: "Manager",
  admin: "Owner",
};

const ROLE_TONE: Record<TeamMember["role"], OpsTagTone> = {
  driver: "gold",
  dispatcher: "accent",
  admin: "neutral",
};

export default function TeamPanel({
  meId,
  viewerRole,
  team,
  deletions = [],
}: {
  meId: string;
  viewerRole: "admin" | "dispatcher";
  team: TeamMember[];
  deletions?: DeletionEntry[];
}) {
  const router = useRouter();
  const isOwner = viewerRole === "admin";
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState<TeamMember["role"]>("driver");

  const canEdit = (m: TeamMember) => isOwner || m.role === "driver" || m.id === meId;
  const canRemove = (m: TeamMember) => isOwner && m.id !== meId;

  function refresh() {
    router.refresh();
  }

  function addMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const pin = (fd.get("pin") as string).trim();
    setError("");
    start(async () => {
      const res = await createTeamMember({ name, role: isOwner ? newRole : "driver", pin });
      if (res.error) { setError(res.error); return; }
      setAdding(false);
      setNewRole("driver");
      refresh();
    });
  }

  function resetPin(m: TeamMember) {
    const pin = window.prompt(`New PIN for ${m.name} (4–6 digits):`)?.trim();
    if (!pin) return;
    setError("");
    start(async () => {
      const res = await setTeamMemberPin(m.id, pin);
      if (res.error) { setError(res.error); return; }
      refresh();
    });
  }

  function rename(m: TeamMember) {
    const name = window.prompt("Name:", m.name)?.trim();
    if (!name || name === m.name) return;
    setError("");
    start(async () => {
      const res = await renameTeamMember(m.id, name);
      if (res.error) { setError(res.error); return; }
      refresh();
    });
  }

  function toggleActive(m: TeamMember) {
    setError("");
    start(async () => {
      const res = await setTeamMemberActive(m.id, !m.active);
      if (res.error) { setError(res.error); return; }
      refresh();
    });
  }

  function remove(m: TeamMember) {
    if (!window.confirm(`Remove ${m.name} from the team?`)) return;
    setError("");
    start(async () => {
      const res = await removeTeamMember(m.id);
      if (res.error) { setError(res.error); return; }
      refresh();
    });
  }

  return (
    <>
      <SubNav items={[{ label: "Team & settings", href: "/team", active: true }]} />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pb-16">
        <div className="pt-8">
          <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Team &amp; settings</h1>
          <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
            Drivers and staff, notification preferences, and the audit log of anything removed.
          </p>
        </div>
        {error && <p className="mt-3 text-[13px] text-ops-danger">{error}</p>}

        {/* Notifications */}
        <section className="mt-9 border-t border-ops-text pt-4">
          <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">Notifications</h2>
          <div className="mt-4 max-w-[520px]">
            <PushToggle />
          </div>
        </section>

        {/* Team */}
        <section className="mt-9 border-t border-ops-text pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">Team</h2>
            <button
              onClick={() => { setAdding((v) => !v); setError(""); }}
              className={adding ? btnSecondary : btnPrimary}
            >
              {adding ? "Cancel" : "+ Add person"}
            </button>
          </div>
          <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
            Everyone signs in with their own PIN, so the route always records who drove.
          </p>

          {adding && (
            <form onSubmit={addMember} className="mt-4 border border-ops-divider p-4 space-y-4 max-w-[420px]">
              <label className="block">
                <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Name</span>
                <input name="name" required autoFocus placeholder="e.g. Mike" className={inputCls} />
              </label>
              {isOwner ? (
                <div>
                  <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">Role</span>
                  <div className="inline-flex border border-ops-divider">
                    {(["driver", "dispatcher", "admin"] as const).map((r, i) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`px-3.5 py-1.5 text-[13px] font-barlow ${i > 0 ? "border-l border-ops-divider" : ""} ${
                          newRole === r ? "bg-ops-accent text-ops-bg" : "hover:bg-[rgba(26,26,26,.07)]"
                        }`}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-[rgba(26,26,26,.62)]">Adding a new <b>Driver</b>.</p>
              )}
              <label className="block">
                <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">PIN (4–6 digits)</span>
                <input name="pin" required inputMode="numeric" pattern="\d{4,6}" maxLength={6} placeholder="••••" className={inputCls} />
              </label>
              <button type="submit" disabled={pending} className={`${btnPrimary} w-full disabled:opacity-60`}>
                {pending ? "Adding…" : "Add to team"}
              </button>
            </form>
          )}

          <div className="mt-4">
            {team.map((m) => (
              <div key={m.id} className={`border-b border-ops-hairline py-3.5 ${m.active ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-barlow font-medium text-[15.5px]">{m.name}</span>
                  <Tag tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role]}</Tag>
                  {m.id === meId && <span className="text-[12px] text-[rgba(26,26,26,.5)]">you</span>}
                  {!m.active && <span className="text-[12px] text-[rgba(26,26,26,.5)] ml-auto">inactive</span>}
                </div>
                {canEdit(m) && (
                  <div className="flex gap-4 mt-2 flex-wrap">
                    <button onClick={() => resetPin(m)} disabled={pending} className={btnGhost}>Reset PIN</button>
                    <button onClick={() => rename(m)} disabled={pending} className={`${btnGhost} !text-[rgba(26,26,26,.62)] hover:!text-ops-text`}>Rename</button>
                    {canRemove(m) && (
                      <>
                        <button onClick={() => toggleActive(m)} disabled={pending} className={`${btnGhost} !text-[rgba(26,26,26,.62)] hover:!text-ops-text`}>
                          {m.active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => remove(m)} disabled={pending} className={`${btnGhost} !text-ops-danger ml-auto`}>Remove</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recently deleted */}
        <section className="mt-9 border-t border-ops-text pt-4 mb-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">Recently deleted</h2>
            <Kicker>{deletions.length === 0 ? "nothing yet" : `last ${deletions.length}`}</Kicker>
          </div>
          <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
            Soft-deleted records. The audit trigger captures what was removed and who removed it.
          </p>
          {deletions.length === 0 ? (
            <p className="mt-4 text-[15px] text-[rgba(26,26,26,.68)]">No recent deletions.</p>
          ) : (
            <div className="mt-3">
              {deletions.map((d) => (
                <div key={d.id} className="border-b border-ops-hairline py-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Tag tone="neutral">{TABLE_LABEL[d.table_name] ?? d.table_name}</Tag>
                    <span className="font-barlow font-medium text-[15px] truncate">{deletionTitle(d)}</span>
                  </div>
                  {typeof d.before_state?.removal_reason === "string" && d.before_state.removal_reason && (
                    <p className="text-[13.5px] text-[rgba(26,26,26,.75)] mt-1 italic">
                      &ldquo;{d.before_state.removal_reason}&rdquo;
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[12.5px] text-[rgba(26,26,26,.55)] flex-wrap">
                    <span>by <b className="text-[rgba(26,26,26,.75)]">{d.deleted_by_name ?? "system"}</b></span>
                    <span>·</span>
                    <span>{timeAgo(d.deleted_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
