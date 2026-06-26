"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTeamMember,
  setTeamMemberPin,
  renameTeamMember,
  setTeamMemberActive,
  removeTeamMember,
} from "@/lib/actions/team";
import PushToggle from "@/components/PushToggle";

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

// Pick a user-friendly label for the deleted row from its before_state.
// Each audited table has a different "main" field; this central map keeps
// the rendering tidy.
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

const ROLE_STYLE: Record<TeamMember["role"], string> = {
  driver: "bg-gold-primary/20 text-gold-dark",
  dispatcher: "bg-green-primary/10 text-green-primary",
  admin: "bg-green-primary text-cream",
};

export default function SettingsPanel({
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

  // Owner can manage everyone; Manager only drivers and themselves.
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

  const field = "w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary";
  const label = "text-[11px] text-charcoal/40 font-body uppercase tracking-widest block mb-1";

  return (
    <div className="min-h-screen bg-cream-dark">
      <header className="bg-green-primary text-cream px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="font-serif text-lg font-light leading-none">Settings</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold-light">Sweetwater&apos;s</div>
        </div>
        <Link href="/owner" className="text-[11px] uppercase tracking-[0.16em] text-cream/70 min-h-tap flex items-center">← Home</Link>
      </header>

      <div className="p-5 md:p-8 max-w-2xl mx-auto space-y-6">
        {/* Notifications */}
        <section>
          <h2 className="font-serif text-2xl font-light text-charcoal mb-3">Notifications</h2>
          <PushToggle />
        </section>

        {/* Team */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-2xl font-light text-charcoal">Team</h2>
            <button
              onClick={() => { setAdding((v) => !v); setError(""); }}
              className="min-h-tap px-3 py-1.5 bg-green-primary text-cream rounded-lg text-xs font-body uppercase tracking-widest"
            >
              {adding ? "Cancel" : "+ Add"}
            </button>
          </div>
          <p className="text-xs text-charcoal/50 font-body mb-3">
            Everyone signs in with their own PIN, so the route always records who drove.
          </p>

          {adding && (
            <form onSubmit={addMember} className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3 mb-4">
              <div>
                <span className={label}>Name</span>
                <input name="name" required autoFocus placeholder="e.g. Mike" className={field} />
              </div>
              {isOwner ? (
                <div>
                  <span className={label}>Role</span>
                  <div className="flex gap-2">
                    {(["driver", "dispatcher", "admin"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`flex-1 min-h-tap py-2 rounded-lg text-xs font-body uppercase tracking-widest border ${newRole === r ? "bg-green-primary border-green-primary text-cream" : "bg-cream border-cream-dark text-charcoal/50"}`}
                      >
                        {ROLE_LABEL[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-charcoal/50 font-body">Adding a new <b>Driver</b>.</p>
              )}
              <div>
                <span className={label}>PIN (4–6 digits)</span>
                <input name="pin" required inputMode="numeric" pattern="\d{4,6}" maxLength={6} placeholder="••••" className={field} />
              </div>
              <button type="submit" disabled={pending} className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60">
                {pending ? "Adding…" : "Add to team"}
              </button>
            </form>
          )}

          {error && <p className="text-sm text-red-600 font-body mb-3">{error}</p>}

          <div className="space-y-2">
            {team.map((m) => (
              <div key={m.id} className={`bg-cream rounded-xl border border-cream-dark p-3 ${m.active ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <span className="font-body font-medium text-charcoal">{m.name}</span>
                  <span className={`text-[10px] font-body uppercase tracking-wider px-2 py-0.5 rounded-full ${ROLE_STYLE[m.role]}`}>
                    {ROLE_LABEL[m.role]}
                  </span>
                  {m.id === meId && <span className="text-[10px] font-body text-charcoal/40">you</span>}
                  {!m.active && <span className="text-[10px] font-body text-charcoal/40 ml-auto">inactive</span>}
                </div>
                {canEdit(m) && (
                  <div className="flex gap-3 mt-2 flex-wrap">
                    <button onClick={() => resetPin(m)} disabled={pending} className="text-[11px] font-body uppercase tracking-widest text-green-primary">Reset PIN</button>
                    <button onClick={() => rename(m)} disabled={pending} className="text-[11px] font-body uppercase tracking-widest text-charcoal/50">Rename</button>
                    {canRemove(m) && (
                      <>
                        <button onClick={() => toggleActive(m)} disabled={pending} className="text-[11px] font-body uppercase tracking-widest text-charcoal/50">
                          {m.active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => remove(m)} disabled={pending} className="text-[11px] font-body uppercase tracking-widest text-red-400 ml-auto">Remove</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Recently Deleted — surfaces the audit log so anything soft-deleted
            is visible, attributed, and recoverable. Owner sees all tables;
            Manager-tier sees the same view (no per-role redaction yet). */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-2xl font-light text-charcoal">Recently deleted</h2>
            <span className="font-body text-[10px] uppercase tracking-widest text-charcoal/40">
              {deletions.length === 0 ? "nothing yet" : `last ${deletions.length}`}
            </span>
          </div>
          <p className="text-xs font-body text-charcoal/50 mb-3">
            Soft-deleted records. The audit trigger captures what was removed and who removed it. Restore directly from this list.
          </p>
          {deletions.length === 0 ? (
            <div className="bg-cream rounded-xl border border-cream-dark p-4 text-sm font-body text-charcoal/50">
              No recent deletions.
            </div>
          ) : (
            <div className="space-y-2">
              {deletions.map((d) => (
                <div key={d.id} className="bg-cream rounded-xl border border-cream-dark p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-body uppercase tracking-widest px-2 py-0.5 rounded-full bg-charcoal/5 text-charcoal/50">
                      {TABLE_LABEL[d.table_name] ?? d.table_name}
                    </span>
                    <span className="font-body font-medium text-charcoal truncate">{deletionTitle(d)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] font-body text-charcoal/45 flex-wrap">
                    <span>by <b className="text-charcoal/70">{d.deleted_by_name ?? "system"}</b></span>
                    <span>·</span>
                    <span>{timeAgo(d.deleted_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
