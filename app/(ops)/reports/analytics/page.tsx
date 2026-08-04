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
          { label: "Revenue", href: "/reports/revenue" },
          { label: "Signups", href: "/delivery/signups" },
          { label: "Delivery volume", href: "/reports/analytics", active: true },
        ]}
      />
      <DispatchReportsPage />
    </>
  );
}
