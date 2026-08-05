import DispatchReportsPage from "../../../dispatch/reports/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

// Delivery volume — stops/items drill-down (month → week → day → record).
// Lives under Delivery, not Reports: Reports is the company-level view
// (weekly update, sales, signups) and the delivery numbers belong with the
// delivery work they describe.
export default function DeliveryVolumePage() {
  return (
    <>
      <DeliveryNav active="Volume" />
      <DispatchReportsPage />
    </>
  );
}
