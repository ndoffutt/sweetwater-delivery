import Anthropic from "@anthropic-ai/sdk";

// Reads a SPOT "Outgoing Summary" export (screenshot or PDF) and pulls the
// numbers the weekly update needs. The report groups revenue by Department
// Group: "Counter" is walk-in, and each "Rte: ..." group is a delivery route.
// The *Total column is the one that matters; Store Totals closes the sheet.

export interface SpotGroup {
  label: string;
  total: number;
  pieces: number;
  orders: number;
}

export interface SpotSummary {
  period_start: string | null; // YYYY-MM-DD
  period_end: string | null;
  groups: SpotGroup[];
  store_total: number;
  store_pieces: number;
  store_orders: number;
}

const SYSTEM = `You read "Outgoing Summary" reports exported from a dry-cleaning point-of-sale system (SPOT) for Sweetwater's Cleaners. The report may arrive as a screenshot or a PDF page.

The header contains a date range like "From 07/26/26 12:00 AM to 08/02/26 11:59 PM". Convert those dates to YYYY-MM-DD (two-digit years are 20xx).

The body is grouped by "Department Group". Each group (e.g. "Counter", "Rte: Thursday (EH)", "Rte: Wednesday (SH,BH)") lists department rows (Dry Cleaning, Household, Laundry, ...) followed by a subtotal row. Columns include Cash, Checks, Credit Cards, Cash Credit, Account, Other, *Total, Pieces, Orders, Tax, Enviro.

For EACH group, report the group's SUBTOTAL row (not the individual department rows):
- label: the group heading exactly as printed (a truncated heading like "Rte: Wednesday (SH,B" is fine as-is).
- total: the *Total column value.
- pieces / orders: the Pieces and Orders columns.

Then report the "Store Totals" row the same way (store_total, store_pieces, store_orders).

Rules: numbers may contain commas — strip them. Do not invent groups. If a value is unreadable, use 0; if a date is unreadable, use null.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    period_start: { type: ["string", "null"] },
    period_end: { type: ["string", "null"] },
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          total: { type: "number" },
          pieces: { type: "number" },
          orders: { type: "number" },
        },
        required: ["label", "total", "pieces", "orders"],
      },
    },
    store_total: { type: "number" },
    store_pieces: { type: "number" },
    store_orders: { type: "number" },
  },
  required: ["period_start", "period_end", "groups", "store_total", "store_pieces", "store_orders"],
} as const;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function normalizeMediaType(mediaType: string): ImageMediaType {
  if (mediaType === "image/png") return "image/png";
  if (mediaType === "image/webp") return "image/webp";
  if (mediaType === "image/gif") return "image/gif";
  return "image/jpeg";
}

export async function extractSpotSummary(
  base64: string,
  mediaType: string
): Promise<SpotSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("SPOT import isn't configured yet. Add ANTHROPIC_API_KEY.");
  }

  const client = new Anthropic({ apiKey });

  const isPdf = mediaType === "application/pdf";
  const sourceBlock = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: normalizeMediaType(mediaType), data: base64 },
      };

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          { type: "text", text: "Extract the date range, every Department Group subtotal, and the Store Totals." },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Couldn't read that export. Try a clearer screenshot.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Couldn't read that export, no data returned.");
  }
  try {
    return JSON.parse(textBlock.text) as SpotSummary;
  } catch {
    throw new Error("Couldn't parse the export data.");
  }
}

/** Split a summary into the weekly-update fields. */
export function deriveRevenue(s: SpotSummary) {
  const isRoute = (l: string) => /^rte\b|route/i.test(l.trim());
  const delivery = s.groups.filter((g) => isRoute(g.label)).reduce((a, g) => a + g.total, 0);
  const counter = s.groups.filter((g) => !isRoute(g.label)).reduce((a, g) => a + g.total, 0);

  // A week-long range fills the weekly fields; a Jan-1-anchored or long range
  // fills the YTD fields instead.
  let span: "week" | "ytd" = "week";
  if (s.period_start && s.period_end) {
    const days =
      (new Date(s.period_end).getTime() - new Date(s.period_start).getTime()) / 86400000;
    if (days > 40 || /^\d{4}-01-01$/.test(s.period_start)) span = "ytd";
  }

  return {
    span,
    sweetwater: Math.round(s.store_total * 100) / 100,
    delivery: Math.round(delivery * 100) / 100,
    counter: Math.round(counter * 100) / 100,
    pieces: s.store_pieces,
    orders: s.store_orders,
  };
}
