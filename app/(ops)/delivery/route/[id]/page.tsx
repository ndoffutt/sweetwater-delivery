import RouteDetailPage from "../../../../dispatch/route/[id]/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default function OpsRouteDetailPage(props: { params: { id: string } }) {
  return (
    <>
      <DeliveryNav active="Today's run" />
      <RouteDetailPage {...props} />
    </>
  );
}
