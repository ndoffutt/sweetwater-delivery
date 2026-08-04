import CustomersPage from "../../../dispatch/customers/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

export default function OpsCustomersPage() {
  return (
    <>
      <DeliveryNav active="Customers" />
      <CustomersPage />
    </>
  );
}
