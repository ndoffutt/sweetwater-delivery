import RoutePlanPage from "../../../dispatch/route-plan/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function OpsRoutePlanPage() {
  return (
    <>
      <DeliveryNav active="Route plan" />
      <RoutePlanPage />
    </>
  );
}
