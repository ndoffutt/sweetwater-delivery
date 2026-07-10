// Structured address helpers. The customer's `address` column stays the
// canonical one-line string (used for geocoding, maps, display); street/town/
// zip are the editable parts. parseAddress splits a full string for editing;
// composeAddress rebuilds the canonical string from the parts on save.

export interface AddressParts {
  street: string;
  town: string;
  zip: string;
}

// "…, Town, NY 11963" — town is the segment right before the state + ZIP.
const TOWN_ZIP = /(?:^|,)\s*([^,]+?)\s*,\s*[A-Za-z]{2}\s*(\d{5})(?:-\d{4})?\s*$/;

/** Best-effort split of a one-line address into street / town / zip. */
export function parseAddress(full: string | null | undefined): AddressParts {
  const s = (full ?? "").trim();
  if (!s) return { street: "", town: "", zip: "" };
  const m = s.match(TOWN_ZIP);
  if (m && m.index != null) {
    const street = s.slice(0, m.index).replace(/,\s*$/, "").trim();
    return { street, town: m[1].trim(), zip: m[2] };
  }
  // No recognizable "Town, ST ZIP" tail — keep it all as street.
  return { street: s, town: "", zip: "" };
}

/** Recompose a canonical one-line address from parts. State is NY here. */
export function composeAddress(p: {
  street?: string | null;
  town?: string | null;
  zip?: string | null;
}): string {
  const street = (p.street ?? "").trim();
  const town = (p.town ?? "").trim();
  const zip = (p.zip ?? "").trim();
  const tail = zip ? `NY ${zip}` : town ? "NY" : "";
  return [street, town, tail].filter(Boolean).join(", ");
}
