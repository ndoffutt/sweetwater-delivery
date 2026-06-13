"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import WelcomeBack from "./WelcomeBack";

type NavId = "dispatch" | "customers" | "sales" | "messages" | "history" | "live" | "reports";
type NavItem = { id: NavId; label: string; href: string };
const ITEMS: Record<NavId, NavItem> = {
  dispatch: { id: "dispatch", label: "Dispatch", href: "/dispatch" },
  customers: { id: "customers", label: "Customers", href: "/dispatch/customers" },
  sales: { id: "sales", label: "Sales", href: "/sales/prospects" },
  messages: { id: "messages", label: "Messages", href: "/dispatch/messages" },
  history: { id: "history", label: "History", href: "/dispatch/history" },
  live: { id: "live", label: "Live", href: "/dispatch/live" },
  reports: { id: "reports", label: "Reports", href: "/dispatch/reports" },
};
// Owner (admin) gets the slimmed-down console (Sales lives on the /owner home);
// Manager keeps the ops tabs + Sales so Ahsin can work prospects. Messages is
// owner-only for now while it's being tested.
const NAV_BY_ROLE: Record<"dispatcher" | "admin", NavItem[]> = {
  admin: [ITEMS.dispatch, ITEMS.customers, ITEMS.messages, ITEMS.history],
  dispatcher: [ITEMS.dispatch, ITEMS.customers, ITEMS.sales, ITEMS.history, ITEMS.live, ITEMS.reports],
};

function NavIcon({ id, className = "w-5 h-5" }: { id: NavId; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<NavId, React.ReactNode> = {
    dispatch: <g {...p}><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M8.4 18H14a3 3 0 000-6H9a3 3 0 010-6h6.5" /></g>,
    customers: <g {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0111 0" /><path d="M16 5.2a3 3 0 010 5.6M16.5 20a5.5 5.5 0 00-2-4.3" /></g>,
    sales: <g {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></g>,
    messages: <g {...p}><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4.5 3.5V17H4a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 9.5h8M8 12.5h5" /></g>,
    history: <g {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></g>,
    live: <g {...p}><circle cx="12" cy="12" r="2.4" /><path d="M7.5 7.5a6 6 0 000 9M16.5 7.5a6 6 0 010 9M4.7 4.7a10 10 0 000 14.6M19.3 4.7a10 10 0 010 14.6" /></g>,
    reports: <g {...p}><path d="M4 20V4M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12.5" y="8" width="3" height="9" /><rect x="18" y="14" width="3" height="3" /></g>,
  };
  return <svg viewBox="0 0 24 24" className={className}>{paths[id]}</svg>;
}

function TruckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h10v9H3zM13 9h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

export default function MgrShell({
  userName,
  role = "dispatcher",
  children,
}: {
  userName: string;
  role?: "dispatcher" | "admin";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const NAV = NAV_BY_ROLE[role];
  const hasMessages = NAV.some((n) => n.id === "messages");
  const hasSales = NAV.some((n) => n.id === "sales");

  // Unread-texts badge on the Messages tab. Tolerant: 0 until the messaging
  // migration runs / Twilio is connected.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!hasMessages) return;
    let live = true;
    const poll = () =>
      fetch("/api/messages?unread=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (live) setUnread(d.unread ?? 0); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 45000);
    return () => { live = false; clearInterval(t); };
  }, [pathname, hasMessages]);

  // Overdue-visit badge on the Sales tab.
  const [overdue, setOverdue] = useState(0);
  useEffect(() => {
    if (!hasSales) return;
    let live = true;
    const poll = () =>
      fetch("/api/prospects/overdue", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (live) setOverdue(d.count ?? 0); })
        .catch(() => {});
    poll();
    const t = setInterval(poll, 120000);
    return () => { live = false; clearInterval(t); };
  }, [pathname, hasSales]);

  const badgeCount = (id: NavId) =>
    id === "messages" ? unread : id === "sales" ? overdue : 0;

  const Badge = ({ id }: { id: NavId }) =>
    badgeCount(id) > 0 ? (
      <span className="ml-auto bg-gold-primary text-charcoal text-[10px] font-body font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
        {badgeCount(id)}
      </span>
    ) : null;

  // Active = nav item whose href is the longest prefix of the current path.
  const active = NAV.reduce<NavId>((acc, n) => {
    const isMatch = n.href === "/dispatch" ? pathname === "/dispatch" || pathname.startsWith("/dispatch/scan") || pathname.startsWith("/dispatch/route") || pathname.startsWith("/dispatch/signups") : pathname.startsWith(n.href);
    if (isMatch) return n.id;
    return acc;
  }, "dispatch");

  const current = NAV.find((n) => n.id === active)!;

  async function signOut() {
    await logout();
    router.push("/");
  }

  return (
    <div className="md:flex md:h-screen bg-cream-dark">
      <WelcomeBack name={userName} />
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-green-primary text-cream">
        <div className="px-5 pt-6 pb-5">
          <div className="font-serif text-2xl font-light leading-none">Sweetwater&apos;s</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gold-light mt-1">Dispatch</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((n) => {
            const on = n.id === active;
            return (
              <Link key={n.id} href={n.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors ${on ? "bg-white/12 text-cream" : "text-cream/65 hover:text-cream hover:bg-white/5"}`}>
                <span className={on ? "text-gold-light" : ""}><NavIcon id={n.id} /></span>
                {n.label}
                <Badge id={n.id} />
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-3 space-y-1">
          <Link href="/owner" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-cream/65 hover:text-cream hover:bg-white/5 transition-colors">
            ← Home
          </Link>
          <Link href="/driver" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gold-primary/90 hover:bg-gold-primary text-charcoal text-sm font-body transition-colors">
            <TruckIcon /> Driver View
          </Link>
        </div>
        <div className="px-5 py-5 border-t border-white/10">
          <div className="text-xs text-cream/60 font-body">{userName}</div>
          <button onClick={signOut} className="mt-1 text-[11px] uppercase tracking-[0.16em] text-cream/60 hover:text-cream font-body">
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-green-primary text-cream px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-serif text-lg font-light leading-none">{current.label}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold-light">Sweetwater&apos;s Dispatch</div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/driver" className="flex items-center gap-1.5 bg-gold-primary text-charcoal rounded-full pl-2.5 pr-3 py-1.5 text-[11px] uppercase tracking-[0.12em] font-body">
            <TruckIcon className="w-4 h-4" /> Drive
          </Link>
          <Link href="/owner" className="text-[11px] uppercase tracking-[0.16em] text-cream/70 min-h-tap flex items-center">
            ← Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-w-0 md:overflow-auto pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-green-primary text-cream flex">
        {NAV.map((n) => {
          const on = n.id === active;
          return (
            <Link key={n.id} href={n.href}
              className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 ${on ? "text-gold-light" : "text-cream/65"}`}>
              <NavIcon id={n.id} className="w-5 h-5" />
              <span className="text-[10px] font-body tracking-wide">{n.label}</span>
              {badgeCount(n.id) > 0 && (
                <span className="absolute top-1.5 right-[22%] w-2 h-2 rounded-full bg-gold-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
