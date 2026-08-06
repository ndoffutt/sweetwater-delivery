import CustomersPage from "../../../dispatch/customers/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

export const dynamic = "force-dynamic";

// The admin redirect from /dispatch/customers?id=X preserves the query
// string, but this wrapper wasn't forwarding it — every "Full profile" link
// landed on the plain list instead of the customer it pointed at.
export default function OpsCustomersPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  return (
    <>
      <DeliveryNav active="Customers" />
      <CustomersPage searchParams={searchParams} />
    </>
  );
}
