import DispatchPage from "../../dispatch/page";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Delivery — the run, inside the Ops Hub shell.
//
// The console itself (manifest upload → parse → review → dispatch, automatic
// shortest-drive ordering with a reset escape, wrong-day detection, live
// polling) is the same battle-tested component the manager uses — deliberately
// NOT forked, so a fix for one is a fix for both. The sub-nav nests the pages
// that used to hide in the "More" bucket.
export default function DeliveryPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Today's run", href: "/delivery", active: true },
          { label: "Route plan", href: "/delivery/route-plan" },
          { label: "History", href: "/delivery/history" },
          { label: "Customers", href: "/delivery/customers" },
          { label: "Signups", href: "/delivery/signups" },
        ]}
      />
      <div className="[&_.font-serif]:font-barlowc">
        <DispatchPage />
      </div>
    </>
  );
}
