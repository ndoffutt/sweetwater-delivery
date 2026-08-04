import HistoryPage from "../../../dispatch/history/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

export default function OpsHistoryPage() {
  return (
    <>
      <DeliveryNav active="History" />
      <HistoryPage />
    </>
  );
}
