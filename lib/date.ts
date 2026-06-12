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
