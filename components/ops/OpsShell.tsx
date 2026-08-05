"use client";

// The Ops Hub shell — owner (Nate) only. Four destinations plus the wordmark
// returning to Today. Desktop: a 68px header row with the nav inline. Mobile:
// a 68px bottom tab bar on the dark field. Counts appear beside a label in
// gold-deep when that section has something waiting.
//
// The manager and driver never see this shell: MgrShell and the driver app are
// untouched, per the build direction.

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";

type SectionId = "today" | "delivery" | "messages" | "reports" | "prospects";

// Today is a section like any other. It used to be reachable on desktop only
// by knowing the wordmark was a link, which is not something anyone knows.
const SECTIONS: { id: SectionId; label: string; href: string }[] = [
  { id: "today", label: "Today", href: "/today" },
  { id: "delivery", label: "Delivery", href: "/delivery" },
  { id: "messages", label: "Messages", href: "/messages" },
  { id: "reports", label: "Reports", href: "/reports" },
  { id: "prospects", label: "Prospects", href: "/prospects" },
];

function SectionIcon({ id, className = "w-[22px] h-[22px]" }: { id: SectionId; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SectionId, React.ReactNode> = {
    today: <g {...p}><rect x="3" y="5" width="18" height="16" /><path d="M8 3v4M16 3v4M3 10h18" /></g>,
    delivery: <g {...p}><path d="M3 6h10v9H3zM13 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></g>,
    messages: <g {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></g>,
    reports: <g {...p}><path d="M3 3v18h18" /><path d="M8 17V9M13 17V5M18 17v-6" /></g>,
    prospects: <g {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></g>,
  };
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[id]}</svg>;
}

export interface OpsCounts {
  messages: number;
  reports: number;
  prospects: number;
}

export default function OpsShell({
  userName,
  initialCounts,
  children,
}: {
  userName: string;
  initialCounts: OpsCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [counts, setCounts] = useState<OpsCounts>(initialCounts);
  const [clock, setClock] = useState<string>("");

  const active: SectionId =
    (SECTIONS.find((s) => pathname.startsWith(s.href))?.id as SectionId) ?? "today";

  // Live nav counts, on the cadence the design specifies: messages every 45s,
  // prospects every 120s. The reports count changes only through this app, so
  // the server-rendered value stands until the next navigation.
  useEffect(() => {
    let live = true;
    const pollMessages = () =>
      fetch("/api/messages?unread=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (live) setCounts((c) => ({ ...c, messages: d.unread ?? 0 })); })
        .catch(() => {});
    const pollProspects = () =>
      fetch("/api/prospects/overdue", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (live) setCounts((c) => ({ ...c, prospects: d.count ?? 0 })); })
        .catch(() => {});
    pollMessages();
    pollProspects();
    const t1 = setInterval(pollMessages, 45_000);
    const t2 = setInterval(pollProspects, 120_000);
    return () => { live = false; clearInterval(t1); clearInterval(t2); };
  }, []);

  // Header clock (client-only to avoid a hydration mismatch).
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) +
          " · " +
          new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      );
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const countFor = (id: SectionId) =>
    id === "messages" ? counts.messages : id === "reports" ? counts.reports : id === "prospects" ? counts.prospects : 0;

  return (
    <div className="ops min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="h-[68px] border-b border-ops-divider shrink-0">
        <div className="mx-auto max-w-[1440px] px-5 md:px-12 h-full flex items-center gap-[38px]">
          <Link href="/today" className="font-barlowc font-semibold uppercase tracking-[0.08em] text-[17px] text-ops-text shrink-0">
            Sweetwater&apos;s
          </Link>
          <nav className="hidden md:flex items-center gap-[38px] h-full">
            {SECTIONS.map((s) => {
              const on = active === s.id;
              const n = countFor(s.id);
              return (
                <Link
                  key={s.id}
                  href={s.href}
                  className={`h-full flex items-center font-barlowc font-semibold text-[19px] leading-none border-b-2 ${
                    on ? "border-ops-accent text-ops-text" : "border-transparent text-[rgba(26,26,26,.62)] hover:text-ops-text"
                  }`}
                >
                  {s.label}
                  {n > 0 && <span className="ml-1.5 text-[15px] text-ops-gold-deep">{n}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4 shrink-0">
            <span className="hidden lg:block text-[13px] text-[rgba(26,26,26,.62)]">{clock}</span>
            <Link
              href="/team"
              title="Settings"
              aria-label="Settings"
              className="min-h-tap min-w-tap flex items-center justify-center text-[rgba(26,26,26,.62)] hover:text-ops-text"
            >
              <svg viewBox="0 0 24 24" className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <button
              title="Sign out"
              onClick={async () => {
                if (!window.confirm("Sign out?")) return;
                await logout();
                router.push("/");
              }}
              className="bg-ops-accent-100 text-ops-accent-700 text-[12px] px-2.5 py-1 font-barlow hover:bg-ops-accent hover:text-ops-bg"
            >
              {userName}
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 min-w-0 pb-24 md:pb-10">{children}</main>

      {/* ── Mobile tab bar (dark field) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 h-[68px] bg-ops-field flex">
        {SECTIONS.map((s) => {
          const on = active === s.id;
          const n = countFor(s.id);
          return (
            <Link
              key={s.id}
              href={s.href}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 min-h-tap ${
                on ? "text-ops-bg" : "text-[rgba(250,247,242,.62)]"
              }`}
            >
              {on && <span className="absolute top-0 left-3 right-3 h-[2px] bg-ops-gold" />}
              <SectionIcon id={s.id} />
              <span className="font-barlowc font-semibold uppercase text-[11px] tracking-[0.08em]">{s.label}</span>
              {n > 0 && <span className="absolute top-[10px] right-[22%] w-2 h-2 bg-ops-gold" />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
