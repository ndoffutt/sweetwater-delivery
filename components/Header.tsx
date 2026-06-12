"use client";

import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";

interface HeaderProps {
  title: string;
  subtitle?: string;
  userName: string;
  backHref?: string;
}

export default function Header({
  title,
  subtitle,
  userName,
  backHref,
}: HeaderProps) {
  const router = useRouter();

  return (
    <header className="bg-green-primary text-cream px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {backHref && (
          <button
            onClick={() => router.push(backHref)}
            className="min-h-tap min-w-tap flex items-center justify-center -ml-2"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="font-serif text-xl font-light">{title}</h1>
          {subtitle && (
            <p className="text-xs text-gold-primary tracking-widest uppercase">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-cream/70 font-body">{userName}</span>
        <button
          onClick={async () => {
            await logout();
            router.push("/");
          }}
          className="min-h-tap px-3 flex items-center text-xs uppercase tracking-widest text-cream/70 hover:text-cream"
        >
          Out
        </button>
      </div>
    </header>
  );
}
