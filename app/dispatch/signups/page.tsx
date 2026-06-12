import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import SignupList, { type Signup } from "@/components/SignupList";

export const dynamic = "force-dynamic";

export default async function SignupsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("customer_signups")
    .select("id, full_name, address, phone, email, start_date, notes, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const signups = (data ?? []) as Signup[];

  return (
    <div className="p-4 md:max-w-3xl md:mx-auto">
      <Link href="/dispatch" className="inline-flex items-center gap-1.5 text-charcoal/50 font-body text-xs uppercase tracking-widest mb-3">
        ← Dispatch
      </Link>
      <h2 className="font-serif text-2xl font-light text-charcoal">New Signups</h2>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-5">From Website</p>
      <SignupList signups={signups} />
    </div>
  );
}
