import DeliveryDetailPage from "../../../../dispatch/delivery/[id]/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

export default function OpsDeliveryDetailPage(props: { params: { id: string } }) {
  return (
    <>
      <DeliveryNav active="History" />
      <DeliveryDetailPage {...props} />
    </>
  );
}
