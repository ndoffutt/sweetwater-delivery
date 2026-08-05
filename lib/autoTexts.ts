// The catalogue of automated customer texts — the single source of truth for
// BOTH what gets sent and what Settings shows. They were briefly separate and
// that's exactly how a settings page ends up describing a message the app
// stopped sending months ago.

export interface AutoTextSpec {
  id: string;
  /** Short name, for the Settings list. */
  title: string;
  /** Which stops this variant applies to. */
  appliesTo: string;
  /** Plain-English trigger. */
  when: string;
  /** Who receives it, including the exclusions. */
  who: string;
  /** The exact message. */
  body: string;
}

const OUT_FOR_DELIVERY_WHEN =
  "The first time the driver taps Navigate on a stop — the van actually leaving the shop. Once per route; a retry after a dead zone can't send it twice.";
const OUT_FOR_DELIVERY_WHO =
  "Every customer whose stop is still pending when it fires. Skips commercial accounts and anyone with automated texts switched off on their customer record.";

export const AUTO_TEXTS: AutoTextSpec[] = [
  {
    id: "out_for_delivery_dropoff",
    title: "Out for delivery",
    appliesTo: "Stops with a drop-off",
    when: OUT_FOR_DELIVERY_WHEN,
    who: OUT_FOR_DELIVERY_WHO,
    body: "Hi! Your Sweetwater's Cleaners delivery is on the way today.",
  },
  {
    id: "out_for_delivery_pickup",
    title: "Out for pick-up",
    appliesTo: "Pick-up-only stops",
    when: OUT_FOR_DELIVERY_WHEN,
    who: OUT_FOR_DELIVERY_WHO,
    body: "Hi! Sweetwater's Cleaners is on the way today. Please have your clothes ready for pick up!",
  },
];

/** The body for a stop. A pickup-only stop is the van coming to COLLECT —
 *  telling those customers their "delivery is on the way" is just wrong. */
export function bodyForStop(hasDropoff: boolean, hasPickup: boolean): string {
  const spec = AUTO_TEXTS.find((t) =>
    hasPickup && !hasDropoff ? t.id === "out_for_delivery_pickup" : t.id === "out_for_delivery_dropoff"
  )!;
  return spec.body;
}
