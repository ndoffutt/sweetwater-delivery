// Drive/on-site timing is only trustworthy from the day the van's Bouncie GPS
// went live. Everything before this date came purely from driver taps, where
// ~17% of stops were logged with arrive and complete pressed together and stops
// were often marked out of order — so those durations are excluded from reports
// rather than shown as if they meant something.
//
// The underlying arrived_at / completed_at timestamps are NOT deleted: they are
// still real clock times and remain useful on the Record screen. Only the
// derived durations are suppressed before this date.
export const TIMING_START = "2026-07-28"; // Bouncie van GPS live

/** Is this route date (YYYY-MM-DD) inside the trustworthy timing window? */
export const timingTrusted = (date: string | null | undefined) =>
  Boolean(date) && (date as string) >= TIMING_START;

export const TIMING_START_LABEL = new Date(TIMING_START + "T12:00:00").toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
