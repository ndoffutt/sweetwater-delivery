import ReportsProspectsPage from "../../../dispatch/reports/prospects/page";
import ReportsNav from "@/components/ops/ReportsNav";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// The actual report is the manager's own page (app/dispatch/reports/prospects)
// — deliberately NOT forked, so a fix for one is a fix for both. This wrapper
// just adds the ops-shell sub-nav and points internal links at the ops-shell
// prospect routes instead of the manager's /sales/prospects.
export default async function OpsReportsProspectsPage() {
  const session = await getSession();
  return (
    <>
      <ReportsNav active="Prospects" role={session?.role === "dispatcher" ? "dispatcher" : "admin"} />
      <ReportsProspectsPage
        links={{
          prospect: (id) => `/prospects/list?id=${id}`,
          touchpoints: "/prospects/touchpoints",
          checkins: "/prospects/checkins",
        }}
      />
    </>
  );
}
