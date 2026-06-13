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
}: {
  meId: string;
  viewerRole: "admin" | "dispatcher";
  team: TeamMember[];
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
      </div>
    </div>
  );
}
