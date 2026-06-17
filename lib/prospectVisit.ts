import type { Prospect, ProspectTouchpoint } from "@/lib/types";

// Reinforce field visits: a prospect we're pursuing or serving (New / Working /
// Active) that hasn't been visited in this many days is "overdue" — it floats
// to the top of the list, gets flagged, and feeds the reminder count.
export const OVERDUE_DAYS = 30;

const SCOPE = new Set<Prospect["status"]>(["new", "working", "active"]);

/** Most recent in-person visit or delivery, or null if never visited. */
export function lastVisitAt(touchpoints: ProspectTouchpoint[] | undefined): string | null {
  let latest: string | null = null;
  for (const t of touchpoints ?? []) {
    if ((t.type === "visit" || t.type === "delivery") && (!latest || t.created_at > latest)) {
      latest = t.created_at;
    }
  }
  return latest;
}

type VisitInput = Pick<Prospect, "status" | "created_at"> & {
  touchpoints?: ProspectTouchpoint[];
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
  return daysSinceVisit(p) >= OVERDUE_DAYS;
}
