// Date helpers anchored to the business's timezone (Eastern / America/New_York).
// Routes are keyed by calendar day (YYYY-MM-DD), so "today" must be computed in
// Eastern time - not UTC - otherwise an evening route (after ~8pm ET) would roll
// onto the next day's date.

const TZ = "America/New_York";

/** YYYY-MM-DD for the current moment, in Eastern time. */
export function easternToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** YYYY-MM-DD for a given Date, in Eastern time. */
export function easternDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * The reporting week for outreach: Friday 00:00 through Thursday 23:59.
 *
 * The weekly update is due Friday morning, so a Monday-anchored week would
 * report a period that hadn't finished yet — Thursday's calls would land in
 * the following week's update. Friday-to-Thursday closes the day before the
 * update is written.
 *
 * `anchor` is any date inside the wanted week (defaults to now).
 */
export function touchpointWeek(anchor: Date = new Date()): { from: Date; to: Date } {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);
  // getDay(): Fri = 5. Days since the most recent Friday.
  const back = (d.getDay() - 5 + 7) % 7;
  const from = new Date(d);
  from.setDate(from.getDate() - back);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}

/** The Friday–Thursday week that a Monday-anchored week_start belongs to:
 *  the Friday before that Monday through the following Thursday. */
export function touchpointWeekForWeekStart(weekStart: string): { from: Date; to: Date } {
  const monday = new Date(weekStart + "T12:00:00");
  const from = new Date(monday);
  from.setDate(from.getDate() - 3);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from, to };
}
