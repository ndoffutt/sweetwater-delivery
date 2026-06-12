// Delivery-day rule: the route splits at the Wainscott shop.
// East of the shop (East Hampton town)  -> Wednesday run (route stops 1-25)
// West of the shop (Water Mill & beyond) -> Thursday run  (stops 26+)

export type DeliveryDay = "wednesday" | "thursday";

// Sweetwater's Cleaners, Wainscott - the east/west dividing line.
const SHOP_LNG = -72.2366;

/** Auto-assign a new customer's day from their location. */
export function dayForLocation(lng: number | null | undefined): DeliveryDay | null {
  if (lng == null) return null;
  return lng > SHOP_LNG ? "wednesday" : "thursday";
}

export const DAY_LABEL: Record<DeliveryDay, string> = {
  wednesday: "Wednesday",
  thursday: "Thursday",
};

/** The designated day for a JS weekday (0=Sun..6=Sat), if it's a run day. */
export function dayForDow(dow: number): DeliveryDay | null {
  if (dow === 3) return "wednesday";
  if (dow === 4) return "thursday";
  return null;
}
