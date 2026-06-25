import type { Prospect, ProspectPriority, ProspectTouchpoint } from "@/lib/types";

// Reinforce field visits: a prospect we're pursuing or serving (New / Working /
// Active) that hasn't been visited within its priority window is "overdue" — it
// floats to the top of the list, gets flagged, and feeds the reminder count.
// The window scales with priority: chase the important ones more often.
export function overdueDaysFor(priority: ProspectPriority | null | undefined): number {
  if (priority === "high") return 30;
  if (priority === "low") return 90;
  return 60; // medium / unset
}

const SCOPE = new Set<Prospect["status"]>(["new", "working", "active"]);

// Types that count as a real outreach touchpoint (reset the overdue clock).
// Notes are internal annotations — they're persistent context, not engagement,
// so they're intentionally NOT in this set.
const ENGAGEMENT_TYPES = new Set(["visit", "delivery", "call", "email", "text"]);

/** Most recent engagement touchpoint, or null if never. */
export function lastEngagementAt(touchpoints: ProspectTouchpoint[] | undefined): string | null {
  let latest: string | null = null;
  for (const t of touchpoints ?? []) {
    if (ENGAGEMENT_TYPES.has(t.type) && (!latest || t.created_at > latest)) {
      latest = t.created_at;
    }
  }
  return latest;
}

/** @deprecated kept as an alias of lastEngagementAt during rename. */
export const lastVisitAt = lastEngagementAt;

type VisitInput = Pick<Prospect, "status" | "created_at"> & {
  priority?: ProspectPriority | null;
  touchpoints?: ProspectTouchpoint[];
  manual_request_at?: string | null;
};

// We measure staleness from the last visit, or — if never visited — from when
// the prospect was added, so a brand-new entry gets a grace period.
function clock(p: VisitInput): string {
  return lastVisitAt(p.touchpoints) ?? p.created_at;
}

export function daysSinceVisit(p: VisitInput): number {
  return Math.floor((Date.now() - new Date(clock(p)).getTime()) / 86400000);
}

export function isOverdueForVisit(p: VisitInput): boolean {
  if (!SCOPE.has(p.status)) return false;
  return daysSinceVisit(p) >= overdueDaysFor(p.priority);
}

/** Dispatcher manually flagged this prospect for outreach. The DB trigger
 * clears the flag automatically on the next non-note touchpoint. */
export function hasManualRequest(p: VisitInput): boolean {
  return !!p.manual_request_at;
}

/** Anything that should bubble to the top of the prospects list and into the
 * "overdue" callout — either time-based overdue OR a manual request. */
export function needsAttention(p: VisitInput): boolean {
  return hasManualRequest(p) || isOverdueForVisit(p);
}
