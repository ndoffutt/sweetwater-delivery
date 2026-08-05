import { SubNav } from "@/components/ops/Bits";

// One sub-nav for the whole Prospects section: the pipeline board, the full
// list, what's due, and the touchpoint log.
export default function ProspectsNav({
  active,
  checkinsDue,
}: {
  active: string;
  checkinsDue?: number;
}) {
  const items = [
    // The pipeline board is columns-across — unusable on a phone, where List
    // and Check-ins due are what you actually want. Desktop keeps it.
    { label: "Pipeline", href: "/prospects", desktopOnly: true },
    { label: "List", href: "/prospects/list" },
    { label: "Check-ins due", href: "/prospects/checkins", count: checkinsDue },
    { label: "Touchpoints", href: "/prospects/touchpoints" },
  ];
  return <SubNav items={items.map((i) => ({ ...i, active: i.label === active }))} />;
}
