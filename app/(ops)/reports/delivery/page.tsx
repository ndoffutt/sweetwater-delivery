import DispatchReportsPage from "../../../dispatch/reports/page";
import ReportsNav from "@/components/ops/ReportsNav";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Delivery reporting — stops/items drill-down (month → week → day → record)
// plus the van's own time-and-motion figures.
export default async function ReportsDeliveryPage() {
  const session = await getSession();
  return (
    <>
      <ReportsNav active="Delivery" role={session?.role === "dispatcher" ? "dispatcher" : "admin"} />
      <DispatchReportsPage />
    </>
  );
}
