import { SubNav } from "@/components/ops/Bits";

// One sub-nav for the whole Prospects section: the pipeline board, the full
// list, what's due, and the touchpoint log.
//
// Single source of truth. This list was previously inlined into each of the
// four pages and had already drifted three ways — Pipeline stayed visible on
// phones everywhere except List, and the Check-ins count was missing from the
// Touchpoints page. A shared component is the only thing that keeps a tab
// list honest across pages.
export default function ProspectsNav({
  active,
  checkinsDue,
  action,
}: {
  active: string;
  checkinsDue?: number;
  action?: React.ReactNode;
}) {
  const items = [
    // The pipeline board is columns-across — unusable on a phone, where List
    // and Check-ins due are what you actually want. Desktop keeps it.
    { label: "Pipeline", href: "/prospects", desktopOnly: true },
    { label: "List", href: "/prospects/list" },
    { label: "Check-ins due", href: "/prospects/checkins", count: checkinsDue },
    { label: "Touchpoints", href: "/prospects/touchpoints" },
  ];
  return (
    <SubNav
      items={items.map((i) => ({ ...i, active: i.label === active }))}
      action={action}
    />
  );
}
