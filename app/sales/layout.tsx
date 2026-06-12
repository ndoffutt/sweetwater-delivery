import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  // Owner and Manager both work sales; drivers don't.
  if (session.role !== "admin" && session.role !== "dispatcher") redirect("/driver");
  const home = session.role === "admin" ? "/owner" : "/dispatch";

  return (
    <div className="md:flex md:h-screen bg-cream-dark">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-green-primary text-cream">
        <div className="px-5 pt-6 pb-5">
          <div className="font-serif text-2xl font-light leading-none">Sweetwater&apos;s</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-gold-light mt-1">Sales</div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          <span className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body bg-white/12 text-cream">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-gold-light" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" />
            </svg>
            Prospects
          </span>
        </nav>
        <div className="px-3 pb-5">
          <Link href={home} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-cream/65 hover:text-cream hover:bg-white/5 transition-colors">
            ← Home
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-green-primary text-cream px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-serif text-lg font-light leading-none">Prospects</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-gold-light">Sweetwater&apos;s Sales</div>
        </div>
        <Link href={home} className="text-[11px] uppercase tracking-[0.16em] text-cream/70 min-h-tap flex items-center">
          ← Home
        </Link>
      </header>

      <main className="flex-1 min-w-0 md:overflow-auto">{children}</main>
    </div>
  );
}
