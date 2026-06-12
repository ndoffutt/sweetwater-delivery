import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";

// How a manifest stop was resolved against the existing customer directory.
// - exact / phone / address: a confident DETERMINISTIC match (auto-merge, but
//   the dispatcher can always override to "create new" in the review screen).
// - suggested: Claude thinks it's likely the same customer, but it needs the
//   dispatcher to confirm before merging (never auto-merged).
// - new: no match - a brand new customer will be created.
export type MatchKind = "exact" | "phone" | "address" | "suggested" | "new";

export interface MatchCandidate {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  day?: "wednesday" | "thursday" | null;
  reason?: string;
}

export interface StopResolution {
  index: number;
  kind: MatchKind;
  customerId?: string; // set for exact | phone | address
  customerName?: string;
  customerLat?: number | null;
  customerLng?: number | null;
  customerSeq?: number | null; // matched customer's position in the master route
  customerDay?: "wednesday" | "thursday" | null; // designated delivery day
  candidate?: MatchCandidate; // set for "suggested"
  // Geocoded coordinates for a brand-new stop (SPOT manifests carry no lat/lng),
  // so the review screen can compute a proximity-based route-spot suggestion.
  geoLat?: number | null;
  geoLng?: number | null;
}

export interface StopLike {
  customer_name: string;
  address: string;
  phone: string | null;
}

interface CustomerRow {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

// Last 10 digits of a phone, so "(917) 880-8506" and "9178808506" match.
const digits = (s: string | null) => (s || "").replace(/\D/g, "").slice(-10);

// Leading house number + first street word, e.g. "117 Pantigo Rd, East Hampton"
// -> "117 pantigo". Enough to recognize the same address; loose on unit/suffix.
function normAddr(a: string): string {
  const m = a.trim().toLowerCase().match(/^(\d+)\s+([a-z]+)/);
  return m ? `${m[1]} ${m[2]}` : "";
}

/**
 * Resolve each extracted stop against the existing customer directory.
 * Tier 1 (deterministic, auto): exact name -> phone -> normalized address.
 * Tier 2 (Claude, suggestion only): for whatever is left, ask Claude whether
 * it's likely the same real-world customer (nicknames, name order, OCR typos,
 * household/business variants). Suggestions are surfaced for confirmation -
 * they are NEVER auto-merged, because a wrong merge sends the driver to the
 * wrong address.
 */
export async function resolveCustomers(
  stops: StopLike[]
): Promise<StopResolution[]> {
  const supabase = createAdminClient();
  // delivery_day is optional (tolerant of the migration not having run yet).
  let { data } = await supabase
    .from("customers")
    .select("id,name,address,phone,lat,lng,route_seq,delivery_day")
    .eq("active", true)
    .is("deleted_at", null);
  if (!data) {
    const retry = await supabase
      .from("customers")
      .select("id,name,address,phone,lat,lng,route_seq")
      .eq("active", true)
      .is("deleted_at", null);
    data = retry.data as unknown as typeof data;
  }
  const customers = (data || []) as (CustomerRow & {
    route_seq: number | null;
    delivery_day?: "wednesday" | "thursday" | null;
  })[];

  // Master-route position per customer, from the same single query.
  const seqMap = new Map<string, number>();
  for (const c of customers) {
    if (c.route_seq != null) seqMap.set(c.id, c.route_seq);
  }

  const byName = new Map<string, CustomerRow>();
  const byPhone = new Map<string, CustomerRow>();
  const byAddr = new Map<string, CustomerRow>();
  for (const c of customers) {
    byName.set(c.name.trim().toLowerCase(), c);
    const p = digits(c.phone);
    if (p.length === 10 && !byPhone.has(p)) byPhone.set(p, c);
    const a = normAddr(c.address);
    if (a && !byAddr.has(a)) byAddr.set(a, c);
  }

  const resolutions: StopResolution[] = [];
  const unresolved: { index: number; stop: StopLike }[] = [];

  const auto = (
    i: number,
    kind: MatchKind,
    c: CustomerRow & { delivery_day?: "wednesday" | "thursday" | null }
  ): StopResolution => ({
    index: i,
    kind,
    customerId: c.id,
    customerName: c.name,
    customerLat: c.lat,
    customerLng: c.lng,
    customerSeq: seqMap.get(c.id) ?? null,
    customerDay: c.delivery_day ?? null,
  });

  stops.forEach((s, i) => {
    const exact = byName.get(s.customer_name.trim().toLowerCase());
    if (exact) {
      resolutions[i] = auto(i, "exact", exact);
      return;
    }
    const ph = digits(s.phone);
    const phoneHit = ph.length === 10 ? byPhone.get(ph) : undefined;
    if (phoneHit) {
      resolutions[i] = auto(i, "phone", phoneHit);
      return;
    }
    const addrHit = normAddr(s.address) ? byAddr.get(normAddr(s.address)) : undefined;
    if (addrHit) {
      resolutions[i] = auto(i, "address", addrHit);
      return;
    }
    resolutions[i] = { index: i, kind: "new" };
    unresolved.push({ index: i, stop: s });
  });

  if (unresolved.length > 0 && customers.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const suggestions = await claudeSuggest(unresolved, customers);
      for (const sug of suggestions) {
        const c = customers[sug.existing];
        if (c) {
          resolutions[sug.index] = {
            index: sug.index,
            kind: "suggested",
            customerSeq: seqMap.get(c.id) ?? null,
            candidate: { id: c.id, name: c.name, address: c.address, lat: c.lat, lng: c.lng, day: c.delivery_day ?? null, reason: sug.reason },
          };
        }
      }
    } catch {
      // If the suggestion call fails, leave the stops as "new" - safe default.
    }
  }

  // Geocode the stops with no auto-matched customer to inherit coords from
  // ("new" AND "suggested" — a suggestion the dispatcher rejects becomes a new
  // customer and still needs a location). SPOT manifests carry no lat/lng, so
  // without this a new customer can't get a proximity-based route-spot
  // suggestion. Only unmatched stops are geocoded, to keep API calls bounded.
  const stillNew = stops
    .map((s, i) => ({ i, s }))
    .filter(
      ({ i }) =>
        (resolutions[i]?.kind === "new" || resolutions[i]?.kind === "suggested") &&
        stops[i].address.trim()
    );
  if (stillNew.length > 0) {
    const geos = await Promise.all(stillNew.map(({ s }) => geocodeAddress(s.address)));
    stillNew.forEach(({ i }, k) => {
      const g = geos[k];
      if (g) {
        resolutions[i] = { ...resolutions[i], geoLat: g.lat, geoLng: g.lng };
      }
    });
  }

  return resolutions;
}

const SUGGEST_SYSTEM = `You help a dry-cleaning delivery service avoid creating DUPLICATE customers.

You are given a numbered list of EXISTING customers (name, address) and a list of NEW delivery stops that did not exactly match any existing customer by name, phone, or address.

For each new stop, decide whether it is plausibly the SAME real-world customer/household as one of the existing ones. These are SUGGESTIONS that a human dispatcher will confirm before anything is merged, so when there is a reasonable candidate, prefer surfacing it over missing it.

Treat these as strong signals of the same customer:
- Nicknames / diminutives: "Bob"↔"Robert", "Andy"↔"Andrew", "Liz"↔"Elizabeth", "Tony"↔"Anthony".
- Name order and initials: "Last, First"↔"First Last", "A. Cahill"↔"Alexa Cahill", middle names/initials.
- "& family" / "/"-joined household members; business-name variants and reordering.
- Minor OCR typos in the name.
- The SAME house number and town, even if the street is formatted differently ("136 N Main St"↔"136 North Main Street").
- The same surname in the same town.

Return null only when there is no reasonable candidate (e.g. a different surname AND a different town, with nothing else in common). When two candidates are plausible, pick the single best one. A wrong suggestion is cheap (the dispatcher rejects it); a missed duplicate is costly.`;

const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stop: { type: "integer" },
          existing: { type: ["integer", "null"] },
          reason: { type: "string" },
        },
        required: ["stop", "existing", "reason"],
      },
    },
  },
  required: ["matches"],
} as const;

async function claudeSuggest(
  items: { index: number; stop: StopLike }[],
  customers: CustomerRow[]
): Promise<{ index: number; existing: number; reason: string }[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const custList = customers
    .map((c, idx) => `${idx}. ${c.name}, ${c.address}`)
    .join("\n");
  const stopList = items
    .map(
      (it) =>
        `#${it.index}: ${it.stop.customer_name}, ${it.stop.address}${
          it.stop.phone ? `, ${it.stop.phone}` : ""
        }`
    )
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SUGGEST_SYSTEM,
    messages: [
      {
        role: "user",
        content: `EXISTING CUSTOMERS:\n${custList}\n\nNEW STOPS (by stop number):\n${stopList}\n\nFor each new stop, set "existing" to the existing customer's number if it's confidently the same customer, otherwise null.`,
      },
    ],
    output_config: { format: { type: "json_schema", schema: SUGGEST_SCHEMA } },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  let parsed: { matches?: { stop: number; existing: number | null; reason: string }[] };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return [];
  }

  return (parsed.matches || [])
    .filter(
      (m): m is { stop: number; existing: number; reason: string } =>
        m.existing != null && m.existing >= 0 && m.existing < customers.length
    )
    .map((m) => ({ index: m.stop, existing: m.existing, reason: m.reason }));
}
