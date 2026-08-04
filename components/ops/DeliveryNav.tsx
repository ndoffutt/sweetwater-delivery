import Link from "next/link";
import { SubNav, btnSecondary } from "@/components/ops/Bits";

// One sub-nav shared by every Delivery-section page so the owner never leaves
// the ops shell moving between the run, the plan, history and directories.
// "Drive" jumps into the driver app — same button the old owner chooser had.
export default function DeliveryNav({ active }: { active: string }) {
  const items = [
    { label: "Today's run", href: "/delivery" },
    { label: "Route plan", href: "/delivery/route-plan" },
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
