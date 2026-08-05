import { SubNav } from "@/components/ops/Bits";

// One sub-nav for the whole Reports section. Single source of truth: this
// list used to be copy-pasted into every Reports page and drifted between
// them, so a tab could exist on one page and not another.
export default function ReportsNav({ active }: { active: string }) {
  const items = [
    { label: "Weekly update", href: "/reports" },
    { label: "Revenue", href: "/reports/revenue" },
    { label: "Delivery", href: "/reports/delivery" },
    { label: "Prospects", href: "/reports/prospects" },
  ];
  return <SubNav items={items.map((i) => ({ ...i, active: i.label === active }))} />;
}
