import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubNav, Tag } from "@/components/ops/Bits";
import {
  lastEngagementAt,
  overdueDaysFor,
  daysSinceVisit,
  needsAttention,
  hasManualRequest,
} from "@/lib/prospectVisit";
import type { Prospect, ProspectTouchpoint } from "@/lib/types";

export const dynamic = "force-dynamic";

const SEG_LABEL: Record<string, string> = {
  prop_manager: "Property Manager",
  hotel: "Hotel / Resort",
  club: "Golf / Yacht Club",
  restaurant: "Restaurant",
  retail: "Retail",
  other: "Other",
};

// Check-ins due — every prospect whose outreach clock has run out (or that was
// manually flagged), worst first. Same row shape as the prospect list.
export default async function CheckinsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prospects")
    .select("*, touchpoints:prospect_touchpoints(id, type, note, created_at)")
    .is("deleted_at", null);
  const prospects = (data ?? []) as unknown as (Prospect & { touchpoints: ProspectTouchpoint[] })[];

  const due = prospects
    .filter(needsAttention)
    .map((p) => {
      const days = daysSinceVisit(p);
      const window = overdueDaysFor(p.priority);
      const lastAt = lastEngagementAt(p.touchpoints);
      return {
        id: p.id,
        name: p.name,
        segment: SEG_LABEL[p.business_type] ?? p.business_type,
        town: p.town ?? null,
        priority: p.priority ?? "medium",
        overdueBy: Math.max(days - window, 0),
        manual: hasManualRequest(p),
        lastLine: lastAt
          ? `Last touch ${new Date(lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · every ${window}d`
          : `No touch yet · every ${window}d`,
      };
    })
    .sort((a, b) => Number(b.manual) - Number(a.manual) || b.overdueBy - a.overdueBy);

  return (
    <>
      <SubNav
        items={[
          { label: "Pipeline", href: "/prospects" },
          { label: "List", href: "/prospects/list" },
          { label: "Check-ins due", href: "/prospects/checkins", active: true, count: due.length },
          { label: "Touchpoints", href: "/prospects/touchpoints" },
        ]}
      />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pb-12">
        <div className="pt-8">
          <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Check-ins due</h1>
          <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
            {due.length === 0
              ? "Every prospect is inside its outreach window."
              : `${due.length} prospect${due.length === 1 ? "" : "s"} past the outreach window — high priority is every 30 days, medium 60, low 90.`}
          </p>
        </div>

        <div className="mt-6 border-t border-ops-text">
          {due.length === 0 ? (
            <p className="py-6 text-[15px] text-[rgba(26,26,26,.68)]">Nothing due. Check the pipeline for what to work next.</p>
          ) : (
            due.map((p) => (
              <Link
                key={p.id}
                href={`/prospects/list?id=${p.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-ops-hairline py-3.5 hover:bg-[rgba(26,26,26,.035)]"
              >
                <span className="font-barlow font-medium text-[15.5px] min-w-[220px]">{p.name}</span>
                <span className="text-[13px] text-[rgba(26,26,26,.68)] min-w-[200px]">
                  {p.segment}
                  {p.town ? ` · ${p.town}` : ""}
                  {p.priority !== "medium" ? ` · ${p.priority}` : ""}
                </span>
                <span className="flex gap-1.5">
                  {p.manual && <Tag tone="gold">Flagged</Tag>}
                  <Tag tone="danger">{p.overdueBy > 0 ? `${p.overdueBy}d overdue` : "Due now"}</Tag>
                </span>
                <span className="ml-auto text-[13px] text-[rgba(26,26,26,.62)]">{p.lastLine}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
