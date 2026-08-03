// Renders the weekly update in the exact format the business requires.
//
// The format and its hard rules come from the brain wiki (wiki/operations.md)
// and are non-negotiable — the update is read the same way every week, so
// drifting from it costs more than it saves. Rules encoded here:
//
//  1. Every revenue line carries FOUR figures: weekly amount, YTD % vs prior
//     year, YTD % vs goal, YTD dollar difference vs goal. Both comparisons,
//     both labelled. Reporting only variance-to-goal (as updates did through
//     July 2026) made a business running +15% read as flat.
//  2. The delivery line carries four too: weekly amount, YTD %, the 10% goal,
//     and the cumulative dollar gap.
//  3. Action item owners are named individuals, never a generic label.
//  4. The Expectation block appears ONLY when an expectation was missed.
//  5. Completed items read "(Completed)" in the week they finished, then drop
//     out the following week.
//  6. No carryover summary lines at the bottom.
//  7. No closing pipeline summary sentence.
//  8. No em dashes.

/** Goal multiplier on prior year: Sweetwater (B1) 1.15, JRS (B2) 1.16. */
export const GOAL_MULTIPLIER = { sweetwater: 1.15, jrs: 1.16 } as const;
/** Delivery is measured against a flat 10% share goal, not a growth multiple. */
export const DELIVERY_GOAL_PCT = 10;

export interface RevenueLine {
  weekly: number | null;
  ytd: number | null;
  ytdPrior: number | null;
}

export interface ActionItem {
  owner: string;
  action: string;
  section: "operations" | "growth";
  completedThisWeek?: boolean;
}

export interface WeeklyUpdateInput {
  date: Date;
  openIssues: number;
  newIssues: number;
  resolvedIssues: number;
  expectationNote?: string | null;
  staffingStatus?: string | null;
  staffingNote?: string | null;
  equipmentStatus?: string | null;
  equipmentNote?: string | null;
  blockingGrowth?: string | null;
  keyUpdates?: string | null;
  sweetwater: RevenueLine;
  jrs: RevenueLine;
  delivery: RevenueLine & { sweetwaterYtd?: number | null };
  activeOpportunities: number;
  touchpointsThisWeek: number;
  actionItems: ActionItem[];
}

const money = (n: number | null | undefined) =>
  n == null ? "[  ]" : `$${Math.round(n).toLocaleString("en-US")}`;

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Growth line: weekly, YTD % vs prior year, YTD % vs goal, $ diff vs goal. */
function revenueLine(label: string, r: RevenueLine, multiplier: number): string {
  if (r.ytd == null || r.ytdPrior == null || r.ytdPrior === 0) {
    return `- ${label}: ${money(r.weekly)} (YTD: [  ]% vs prior year / [  ]% / $[  ] vs goal)`;
  }
  const goal = r.ytdPrior * multiplier;
  const vsPrior = ((r.ytd - r.ytdPrior) / r.ytdPrior) * 100;
  const vsGoal = ((r.ytd - goal) / goal) * 100;
  const dollarDiff = r.ytd - goal;
  const sign = dollarDiff >= 0 ? "" : "-";
  return `- ${label}: ${money(r.weekly)} (YTD: ${pct(vsPrior)} vs prior year / ${pct(vsGoal)} / ${sign}${money(Math.abs(dollarDiff))} vs goal)`;
}

/** Delivery line: weekly, YTD %, the 10% goal, cumulative dollar gap. */
function deliveryLine(d: WeeklyUpdateInput["delivery"]): string {
  if (d.ytd == null || !d.sweetwaterYtd) {
    return `- Delivery: ${money(d.weekly)} ([  ]% YTD / goal ${DELIVERY_GOAL_PCT}% / $[  ] behind goal)`;
  }
  const sharePct = (d.ytd / d.sweetwaterYtd) * 100;
  const goalDollars = d.sweetwaterYtd * (DELIVERY_GOAL_PCT / 100);
  const gap = goalDollars - d.ytd;
  const gapText = gap > 0 ? `${money(gap)} behind goal` : `${money(Math.abs(gap))} ahead of goal`;
  return `- Delivery: ${money(d.weekly)} (${sharePct.toFixed(1)}% YTD / goal ${DELIVERY_GOAL_PCT}% / ${gapText})`;
}

const items = (list: ActionItem[], section: ActionItem["section"]) => {
  const rows = list.filter((a) => a.section === section);
  if (rows.length === 0) return "- [None]";
  return rows
    .map((a) => `- ${a.owner}: ${a.action}${a.completedThisWeek ? " (Completed)" : ""}`)
    .join("\n");
};

export function renderWeeklyUpdate(u: WeeklyUpdateInput): string {
  const parts: string[] = [];

  parts.push(`**Weekly Update: ${fmtDate(u.date)}**`);
  parts.push("");
  parts.push("**1. Customer Issues**");
  parts.push("");
  parts.push("Status");
  parts.push(`- Open issues: ${u.openIssues}`);
  parts.push(`- New this week: ${u.newIssues}`);
  parts.push(`- Resolved this week: ${u.resolvedIssues}`);
  // Rule 4: expectation block only when the expectation was missed.
  if (u.expectationNote && u.expectationNote.trim()) {
    parts.push("");
    parts.push("Expectation");
    parts.push(`- ${u.expectationNote.trim()}`);
  }
  parts.push("");
  parts.push("---");
  parts.push("");
  parts.push("**2. Operations (Enable Growth)**");
  parts.push("");
  parts.push("Status");
  parts.push(`- Staffing: ${u.staffingStatus || "[  ]"}${u.staffingNote ? ` - ${u.staffingNote}` : ""}`);
  parts.push(`- Equipment: ${u.equipmentStatus || "[  ]"}${u.equipmentNote ? ` - ${u.equipmentNote}` : ""}`);
  parts.push(`- Operations blocking growth: ${u.blockingGrowth?.trim() || "None"}`);
  parts.push("");
  parts.push("Key Updates");
  const keys = (u.keyUpdates || "").split("\n").map((l) => l.trim()).filter(Boolean);
  parts.push(keys.length ? keys.map((k) => `- ${k}`).join("\n") : "- [None]");
  parts.push("");
  parts.push("Action Items");
  parts.push(items(u.actionItems, "operations"));
  parts.push("");
  parts.push("---");
  parts.push("");
  parts.push("**3. Growth (North Star: Revenue and Sales Engine)**");
  parts.push("");
  parts.push("Results");
  parts.push(revenueLine("Sweetwater Revenue", u.sweetwater, GOAL_MULTIPLIER.sweetwater));
  parts.push(revenueLine("JRS Revenue", u.jrs, GOAL_MULTIPLIER.jrs));
  parts.push(deliveryLine(u.delivery));
  parts.push("");
  parts.push("Sales Engine");
  parts.push(`- Active opportunities: ${u.activeOpportunities}`);
  parts.push(`- Touchpoints completed this week: ${u.touchpointsThisWeek}`);
  parts.push("");
  parts.push("Action Items");
  parts.push(items(u.actionItems, "growth"));

  // Rules 6 + 7: nothing after this. No carryover summary, no closing sentence.
  // Rule 8: no em dashes anywhere in the generated text.
  return parts.join("\n").replace(/—/g, "-");
}
