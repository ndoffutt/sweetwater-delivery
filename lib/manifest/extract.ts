import Anthropic from "@anthropic-ai/sdk";

export interface ManifestStop {
  stop_order: number | null;
  customer_name: string;
  address: string;
  phone: string | null;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  piece_count?: number | null; // garments to drop off at this stop
  // Only set by the CSV path (SPOT CSV includes coordinates); vision/PDF leave
  // these undefined and coords come from the matched customer instead.
  lat?: number | null;
  lng?: number | null;
}

const SYSTEM = `You read photos of printed "Delivery Manifest" sheets from a dry-cleaning point-of-sale system (SPOT) and turn them into a structured delivery route.

The sheet lists stops top to bottom. Each stop block contains:
- A route sequence number on the far LEFT (e.g. 4, 5, 6, 12, 16, 19, 20). These are NOT contiguous, so preserve each one as stop_order.
- An account number (e.g. SA5735, 1007149); ignore it.
- An address line: street, town, ZIP, then a phone in parentheses, e.g. "1088 Mecox Rd  Bridgehampton 11932 (201) 280-1000". A stop may list two phone numbers; use the first.
- The customer name in "Last, First" format, e.g. "Hirsch, Helyn". Names may be slash-joined for multiple people.
- "On Truck" / "Delivered" / "Picked Up" checkboxes (these are for the driver; ignore their checked state).
- An invoice table (Invoice #, Department such as Laundry / Dry Cleaning / Household, Pieces, Price, Paid).
- Some stops are marked "On Dmnd" (on demand) with a "Time Range" (e.g. 08:00 - 16:00) and show "(No Invoices)".

For EACH stop, produce:
- stop_order: the left sequence number as an integer (null if unreadable).
- customer_name: convert "Last, First" to "First Last" (e.g. "Helyn Hirsch"). For slash-joined names, keep them readable (e.g. "Carleen Borsella / Jo Hoefler").
- address: "street, town, NY zip". These are all in New York, so add "NY" if it is not printed. Do NOT include the phone number in the address.
- phone: the first phone number exactly as printed (e.g. "(201) 280-1000"), or null if none.
- has_dropoff / has_pickup, apply these rules in order:
  1. If the stop is marked "On Dmnd" (on demand), it is ALWAYS pickup-only: set has_pickup = true and has_dropoff = false, no matter what else is shown.
  2. Otherwise, has_dropoff = true if the stop lists invoices / pieces to deliver (false if it shows "(No Invoices)"), and has_pickup = false.
- notes: a short note capturing "On demand" and any time-range window, e.g. "On demand, 08:00–16:00". Use null if there is nothing notable.
- piece_count: the TOTAL number of garment pieces to DELIVER at this stop, summed across the stop's invoice lines (the "Pieces" column). Use 0 for pickup-only / "(No Invoices)" stops.

Rules:
- Output exactly one entry per stop, in the order they appear top to bottom.
- Ignore prices, totals, due dates, barcodes, and any garbled or decorative font characters.
- Do not invent stops or fields. If a text value is unreadable, make your best legible guess; if a value is truly absent, use null where allowed.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    stops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stop_order: { type: ["integer", "null"] },
          customer_name: { type: "string" },
          address: { type: "string" },
          phone: { type: ["string", "null"] },
          has_dropoff: { type: "boolean" },
          has_pickup: { type: "boolean" },
          notes: { type: ["string", "null"] },
          piece_count: { type: "integer" },
        },
        required: [
          "stop_order",
          "customer_name",
          "address",
          "phone",
          "has_dropoff",
          "has_pickup",
          "notes",
          "piece_count",
        ],
      },
    },
  },
  required: ["stops"],
} as const;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function normalizeMediaType(mediaType: string): ImageMediaType {
  if (mediaType === "image/png") return "image/png";
  if (mediaType === "image/webp") return "image/webp";
  if (mediaType === "image/gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Send a manifest photo (base64) to Claude vision and extract the stops.
 * Throws if ANTHROPIC_API_KEY is missing or the model response can't be parsed.
 */
export async function extractManifestStops(
  base64: string,
  mediaType: string
): Promise<ManifestStop[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Manifest scanning isn't configured yet. Add ANTHROPIC_API_KEY."
    );
  }

  const client = new Anthropic({ apiKey });

  // SPOT manifests arrive as a photo of a printed sheet (image) or, less often,
  // a PDF export. PDFs go in a "document" block; images in an "image" block.
  const isPdf = mediaType === "application/pdf";
  const sourceBlock = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: base64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: normalizeMediaType(mediaType),
          data: base64,
        },
      };

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          {
            type: "text",
            text: "Extract every delivery stop from this manifest, in order.",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Couldn't read the manifest, no text returned.");
  }

  let parsed: { stops?: ManifestStop[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Couldn't parse the manifest data.");
  }

  return Array.isArray(parsed.stops) ? parsed.stops : [];
}
