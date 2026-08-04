import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubNav, SegLinks, Tag } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

interface TpRow {
  id: string;
  type: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  prospects: { id: string; name: string; town: string | null } | null;
}

const FILTERS = [
  { key: "all", label: "Everything", types: null as string[] | null },
  { key: "visit", label: "Visits", types: ["visit"] },
  { key: "call", label: "Calls", types: ["call"] },
  { key: "delivery", label: "Deliveries", types: ["delivery"] },
  { key: "other", label: "Email & text", types: ["email", "text"] },
];

const TYPE_TONE: Record<string, "accent" | "gold" | "neutral"> = {
  visit: "accent",
  delivery: "gold",
  call: "accent",
};

// Touchpoints — the outreach log across every prospect, filterable by how the
// touch happened. Notes are excluded: they don't reset the outreach clock.
export default async function TouchpointsPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const filter = FILTERS.find((f) => f.key === (searchParams?.type ?? "all")) ?? FILTERS[0];

  const supabase = createAdminClient();
  let rows: TpRow[] = [];
  try {
    let q = supabase
      .from("prospect_touchpoints")
      .select("id, type, note, created_by, created_at, prospects(id, name, town)")
      .neq("type", "note")
      .order("created_at", { ascending: false })
      .limit(300);
    if (filter.types) q = q.in("type", filter.types);
    const { data, error } = await q;
    if (!error) rows = (data ?? []) as unknown as TpRow[];
  } catch {
    /* empty */
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <SubNav
        items={[
          { label: "Pipeline", href: "/prospects" },
          { label: "List", href: "/prospects/list" },
          { label: "Check-ins due", href: "/prospects/checkins" },
          { label: "Touchpoints", href: "/prospects/touchpoints", active: true },
        ]}
      />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pb-12">
        <div className="pt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Touchpoints</h1>
            <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
              Every outreach touch on record, newest first · notes don&apos;t count
            </p>
          </div>
          <div className="overflow-x-auto ops-subnav max-w-full">
            <SegLinks
              options={FILTERS.map((f) => ({
                label: f.label,
                href: f.key === "all" ? "/prospects/touchpoints" : `/prospects/touchpoints?type=${f.key}`,
                selected: filter.key === f.key,
              }))}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-ops-text">
          {rows.length === 0 ? (
            <p className="py-6 text-[15px] text-[rgba(26,26,26,.68)]">
              No {filter.key === "all" ? "" : `${filter.label.toLowerCase()} `}touchpoints logged yet.
            </p>
          ) : (
            rows.map((t) => (
              <div key={t.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ops-hairline py-3">
                <span className="text-[13px] text-[rgba(26,26,26,.62)] w-[120px] shrink-0">{fmt(t.created_at)}</span>
                <Tag tone={TYPE_TONE[t.type] ?? "neutral"}>{t.type}</Tag>
                {t.prospects ? (
                  <Link href={`/prospects/list?id=${t.prospects.id}`} className="font-barlow font-medium text-[15px] text-ops-accent">
                    {t.prospects.name}
                  </Link>
                ) : (
                  <span className="text-[15px] text-[rgba(26,26,26,.62)]">(deleted prospect)</span>
                )}
                {t.prospects?.town && <span className="text-[13px] text-[rgba(26,26,26,.62)]">{t.prospects.town}</span>}
                {t.note && <span className="text-[14px] text-[rgba(26,26,26,.8)] basis-full md:basis-auto md:ml-2">{t.note}</span>}
                {t.created_by && <span className="ml-auto text-[12.5px] text-[rgba(26,26,26,.5)]">{t.created_by}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
