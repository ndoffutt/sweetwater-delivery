import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import SignupList, { type Signup } from "@/components/SignupList";

export const dynamic = "force-dynamic";

type SignupRow = Signup & { status: string; customer_id: string | null };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function SignupsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  // ALL signups, newest first — pending ones stay actionable, handled ones show
  // as history so nothing disappears from the list.
  const { data } = await supabase
    .from("customer_signups")
    .select("id, full_name, address, phone, email, start_date, notes, status, customer_id, created_at")
    .order("created_at", { ascending: false });

  const all = (data ?? []) as SignupRow[];
  const pending = all.filter((s) => s.status === "pending");
  const handled = all.filter((s) => s.status !== "pending");

  return (
    <div className="p-4 md:max-w-3xl md:mx-auto">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
        ← Dispatch
      </Link>
      <h2 className="font-serif text-2xl font-light text-charcoal">Signups</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-6">
        From website · {all.length} total
      </p>

      {/* Pending — still actionable (add as customer / dismiss) */}
      <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-3">
        New{pending.length ? ` · ${pending.length}` : ""}
      </p>
      <SignupList signups={pending} />

      {/* Handled — full history, read-only */}
      {handled.length > 0 && (
        <div className="mt-8">
          <p className="font-body text-[11px] uppercase tracking-widest text-charcoal/35 mb-3">
            Handled · {handled.length}
          </p>
          <div className="space-y-2">
            {handled.map((s) => (
              <div key={s.id} className="bg-cream rounded-xl border border-cream-dark p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-body text-sm text-charcoal truncate">{s.full_name}</span>
                    <span className={`shrink-0 text-[10px] font-body uppercase tracking-wide px-1.5 py-0.5 rounded-full ${s.status === "added" ? "bg-green-primary/10 text-green-primary" : "bg-charcoal/5 text-charcoal/45"}`}>
                      {s.status === "added" ? "✓ Customer" : "Dismissed"}
                    </span>
                  </div>
                  <p className="text-xs text-charcoal/45 font-body truncate">
                    {s.address}{s.phone ? ` · ${s.phone}` : ""}{s.email ? ` · ${s.email}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="block text-[11px] text-charcoal/40 font-body">{fmtDate(s.created_at)}</span>
                  {s.status === "added" && s.customer_id && (
                    <Link href={`/dispatch/customers?id=${s.customer_id}`} className="text-[11px] text-green-primary font-body">
                      View customer ›
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
