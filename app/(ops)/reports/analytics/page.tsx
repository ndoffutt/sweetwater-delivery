import DispatchReportsPage from "../../../dispatch/reports/page";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Analytics — the drill-down charts (stops/items by month → week → day →
// delivery record), inside the ops shell.
export default function OpsAnalyticsPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Weekly update", href: "/reports" },
          { label: "Analytics", href: "/reports/analytics", active: true },
          { label: "Route efficiency", href: "/delivery/route-plan" },
        ]}
      />
      <DispatchReportsPage />
    </>
  );
}
