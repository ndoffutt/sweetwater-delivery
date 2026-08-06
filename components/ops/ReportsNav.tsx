import { SubNav } from "@/components/ops/Bits";

// One sub-nav for the whole Reports section. Single source of truth: this
// list used to be copy-pasted into every Reports page and drifted between
// them, so a tab could exist on one page and not another.
//
// Revenue is hidden for the manager (dispatcher) — the one thing that
// doesn't mirror the owner's view. The route itself is also blocked
// (middleware + the page's own redirect); this just keeps the tab from
// dangling in front of someone who'd bounce off it. Plain component (used
// from both server pages and a client component, ReportsHub) — role comes in
// as a prop rather than reading the session itself.
export default function ReportsNav({ active, role = "admin" }: { active: string; role?: "admin" | "dispatcher" }) {
  const items = [
    { label: "Weekly update", href: "/reports" },
    ...(role === "dispatcher" ? [] : [{ label: "Revenue", href: "/reports/revenue" }]),
    { label: "Delivery", href: "/reports/delivery" },
    { label: "Prospects", href: "/reports/prospects" },
  ];
  return <SubNav items={items.map((i) => ({ ...i, active: i.label === active }))} />;
}
