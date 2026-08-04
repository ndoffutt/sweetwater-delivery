import DispatchPage from "../../dispatch/page";
import DeliveryNav from "@/components/ops/DeliveryNav";

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
      <DeliveryNav active="Today's run" />
      <div className="[&_.font-serif]:font-barlowc">
        <DispatchPage />
      </div>
    </>
  );
}
