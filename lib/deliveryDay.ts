// Delivery-day rule: the route splits at the Wainscott shop.
// East of the shop (East Hampton town)  -> Thursday run
// West of the shop (Water Mill & beyond) -> Wednesday run
// Monday is a small commercial-only run (e.g. twice-weekly accounts); it is
// never auto-assigned by location — it's set by hand in the directory.

export type DeliveryDay = "monday" | "wednesday" | "thursday";

// Sweetwater's Cleaners, Wainscott - the east/west dividing line.
const SHOP_LNG = -72.2366;

/** Auto-assign a new customer's geographic day from their location. */
export function dayForLocation(lng: number | null | undefined): DeliveryDay | null {
  if (lng == null) return null;
  return lng > SHOP_LNG ? "thursday" : "wednesday";
}

export const DAY_LABEL: Record<DeliveryDay, string> = {
  monday: "Monday",
  wednesday: "Wednesday",
  thursday: "Thursday",
};

// Single-letter badge: Monday/Wednesday/Thursday all start differently enough.
export const DAY_INITIAL: Record<DeliveryDay, string> = {
  monday: "M",
  wednesday: "W",
  thursday: "T",
};

export const RUN_DAYS: DeliveryDay[] = ["monday", "wednesday", "thursday"];

/** The designated day for a JS weekday (0=Sun..6=Sat), if it's a run day. */
export function dayForDow(dow: number): DeliveryDay | null {
  if (dow === 1) return "monday";
  if (dow === 3) return "wednesday";
  if (dow === 4) return "thursday";
  return null;
}

/** Compact label for a set of run days, in run order, e.g. "Mon · Thu". */
export function formatDays(days: DeliveryDay[] | null | undefined): string {
  if (!days || days.length === 0) return "";
  return RUN_DAYS.filter((d) => days.includes(d)).map((d) => DAY_LABEL[d]).join(" · ");
}
