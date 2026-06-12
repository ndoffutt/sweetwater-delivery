"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";

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
];

export default function OwnerHome({ name }: { name: string }) {
  const router = useRouter();

  async function signOut() {
    await logout();
    router.push("/");
  }

  return (
    <div className="min-h-screen bg-green-primary flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-4xl font-light text-cream mb-2">Sweetwater&apos;s</h1>
        <p className="font-body text-xs uppercase tracking-widest text-gold-primary">
          Welcome, {name}
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-4 bg-cream rounded-2xl p-5 shadow-xl active:scale-[0.99] transition-transform"
          >
            <span className="shrink-0 w-12 h-12 rounded-xl bg-green-primary/10 text-green-primary flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                {s.icon}
              </svg>
            </span>
            <span className="flex-1">
              <span className="block font-serif text-2xl font-light text-charcoal leading-none">{s.label}</span>
              <span className="block text-xs text-charcoal/40 font-body mt-1">{s.sub}</span>
            </span>
            <span className="text-charcoal/30 text-xl">→</span>
          </Link>
        ))}
      </div>

      <button
        onClick={signOut}
        className="mt-10 text-xs text-cream/60 hover:text-cream font-body uppercase tracking-widest"
      >
        Sign Out
      </button>
    </div>
  );
}
