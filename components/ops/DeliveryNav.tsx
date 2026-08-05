import Link from "next/link";
import { SubNav, btnSecondary } from "@/components/ops/Bits";

// One sub-nav shared by every Delivery-section page so the owner never leaves
// the ops shell moving between the run, the plan, history and directories.
// "Drive" jumps into the driver app — same button the old owner chooser had.
export default function DeliveryNav({ active }: { active: string }) {
  const items = [
    { label: "Today's run", href: "/delivery" },
    // Route plan is intentionally NOT here. The pre-dispatch check on the
    // run itself already flags a bad order, which is the only moment the
    // ordering actually matters — a standing "plan" page just took up nav
    // space. The page still exists at /delivery/route-plan for the rare
    // master-route reshuffle.
    { label: "History", href: "/delivery/history" },
    { label: "Customers", href: "/delivery/customers" },
    { label: "Signups", href: "/delivery/signups" },
  ];
  return (
    <SubNav
      items={items.map((i) => ({ ...i, active: i.label === active }))}
      action={<Link href="/driver" className={btnSecondary}>Drive</Link>}
    />
  );
}
