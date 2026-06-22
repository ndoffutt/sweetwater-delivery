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
  priority?: ProspectPriority | null;
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
  return daysSinceVisit(p) >= overdueDaysFor(p.priority);
}
