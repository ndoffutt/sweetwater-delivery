import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeMissingProspects } from "@/lib/prospectGeo";
import ProspectDirectory from "@/components/ProspectDirectory";
import type { Prospect } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  // Pin any businesses that don't have map coordinates yet (no-op once done).
  await geocodeMissingProspects().catch(() => {});

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("prospects")
    .select("*, touchpoints:prospect_touchpoints(*)")
    .is("deleted_at", null)
    .order("name");

  // Tolerant of the prospects migration not having run yet.
  if (error) {
    return (
      <div className="p-8 max-w-lg">
        <h2 className="font-serif text-2xl font-light text-charcoal mb-2">Prospects</h2>
        <p className="text-sm text-charcoal/60 font-body">
          The prospects tables aren&apos;t set up yet. Run{" "}
          <code className="bg-cream-dark px-1.5 py-0.5 rounded text-xs">supabase/prospects.sql</code>{" "}
          in the Supabase SQL Editor, then reload this page.
        </p>
      </div>
    );
  }

  const prospects = (data ?? []).map((p) => ({
    ...p,
    touchpoints: [...(p.touchpoints ?? [])].sort(
      (a: { created_at: string }, b: { created_at: string }) =>
        b.created_at.localeCompare(a.created_at)
    ),
  })) as Prospect[];

  return <ProspectDirectory prospects={prospects} initialSelectedId={searchParams?.id ?? null} />;
}
