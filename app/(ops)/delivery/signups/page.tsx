import SignupsPage from "../../../dispatch/signups/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

export default function OpsSignupsPage() {
  return (
    <>
      <DeliveryNav active="Signups" />
      <SignupsPage />
    </>
  );
}
