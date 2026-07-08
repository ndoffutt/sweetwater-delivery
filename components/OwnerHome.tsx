"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import type { ActivityItem } from "@/lib/activity";

const SECTIONS = [
  {
    href: "/driver",
    label: "Drive",
    sub: "Run today's route",
    icon: (
      <g>
        <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
        <circle cx="7.5" cy="19" r="1.8" />
        <circle cx="17.5" cy="19" r="1.8" />
      </g>
    ),
  },
  {
    href: "/dispatch",
    label: "Dispatch",
    sub: "Routes, customers & messages",
    icon: (
      <g>
        <circle cx="6" cy="18" r="2.4" />
        <circle cx="18" cy="6" r="2.4" />
        <path d="M8.4 18H14a3 3 0 000-6H9a3 3 0 010-6h6.5" />
      </g>
    ),
  },
  {
    href: "/sales",
    label: "Sales",
    sub: "Prospects & outreach",
    icon: (
      <g>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" />
      </g>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    sub: "Drivers & team",
    icon: (
      <g>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
      </g>
    ),
  },
];

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function OwnerHome({
  name,
  role = "admin",
  overdueCount = 0,
  activity = [],
}: {
  name: string;
  role?: string;
  overdueCount?: number;
  activity?: ActivityItem[];
}) {
  const router = useRouter();

  // Settings (drivers & team) is owner-only for now — hide it from the manager.
  const sections = SECTIONS.filter((s) => !(s.href === "/settings" && role !== "admin"));

  async function signOut() {
    await logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-green-primary">
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="font-serif text-4xl font-light text-cream leading-none">Sweetwater&apos;s</h1>
            <p className="font-body text-xs uppercase tracking-widest text-gold-primary mt-2">
              Welcome, {name}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-[11px] text-cream/60 hover:text-cream font-body uppercase tracking-widest min-h-tap"
          >
            Sign Out
          </button>
        </div>

        {/* Sections */}
        <div className="grid grid-cols-2 gap-3">
          {sections.map((s) => {
            const showBadge = s.href === "/sales" && overdueCount > 0;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="relative bg-cream rounded-2xl p-5 shadow-xl active:scale-[0.99] transition-transform"
              >
                {showBadge && (
                  <span className="absolute top-3 right-3 bg-gold-primary text-charcoal text-xs font-body font-semibold rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center">
                    {overdueCount}
                  </span>
                )}
                <span className="block w-11 h-11 rounded-xl bg-green-primary/10 text-green-primary flex items-center justify-center mb-3">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </span>
                <span className="block font-serif text-2xl font-light text-charcoal leading-none">{s.label}</span>
                <span className="block text-xs text-charcoal/40 font-body mt-1">
                  {showBadge ? `🔔 ${overdueCount} need attention` : s.sub}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Secondary tools — moved off the console tabs so the console stays
            Today / Customers / Prospects / Record. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { href: "/dispatch/messages", label: "💬 Messages", adminOnly: true },
            { href: "/dispatch/reports", label: "📊 Reports", adminOnly: true },
            { href: "/dispatch/signups", label: "📥 Signups", adminOnly: false },
          ]
            .filter((l) => !l.adminOnly || role === "admin")
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="min-h-tap inline-flex items-center px-4 py-2 rounded-full bg-cream/15 text-cream font-body text-xs uppercase tracking-widest hover:bg-cream/25 transition-colors"
              >
                {l.label}
              </Link>
            ))}
        </div>

        {/* Recent activity */}
        <div className="mt-8">
          <p className="text-[11px] uppercase tracking-widest text-cream/60 font-body mb-3">Recent activity</p>
          <div className="bg-cream rounded-2xl shadow-xl divide-y divide-cream-dark overflow-hidden">
            {activity.length === 0 ? (
              <p className="text-sm text-charcoal/40 font-body p-5 text-center">No activity yet.</p>
            ) : (
              activity.map((a) => {
                const inner = (
                  <>
                    <span className="shrink-0 text-lg">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm text-charcoal truncate">{a.title}</p>
                      <p className="text-xs text-charcoal/45 font-body truncate">
                        {a.detail}{a.who ? ` · ${a.who}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-charcoal/35 font-body">{ago(a.at)}</span>
                    {a.href && <span className="shrink-0 text-charcoal/30">›</span>}
                  </>
                );
                return a.href ? (
                  <Link key={a.id} href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-dark/30 active:bg-cream-dark/40 transition-colors">
                    {inner}
                  </Link>
                ) : (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">{inner}</div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
