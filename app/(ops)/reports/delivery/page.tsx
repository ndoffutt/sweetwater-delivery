import DispatchReportsPage from "../../../dispatch/reports/page";
import ReportsNav from "@/components/ops/ReportsNav";

export const dynamic = "force-dynamic";

// Delivery reporting — stops/items drill-down (month → week → day → record)
// plus the van's own time-and-motion figures.
export default function ReportsDeliveryPage() {
  return (
    <>
      <ReportsNav active="Delivery" />
      <DispatchReportsPage />
    </>
  );
}
