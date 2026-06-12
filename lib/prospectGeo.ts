// Geocode prospects (businesses) to map pins. Unlike customer geocoding
// (street addresses only), businesses often resolve better as POIs, so this
// searches POI + address types, biased to the East End.

import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

async function geocodeBusiness(name: string, address: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!TOKEN) return null;
  const q = [name, address].filter(Boolean).join(", ");
  try {
    // bbox pins results to the Twin Forks (Westhampton→Montauk→North Fork) so a
    // vague address like "North Fork, NY" can't resolve to another state.
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${TOKEN}&limit=1&country=us&types=poi,address,place&proximity=-72.2,40.96` +
      `&bbox=-73.05,40.55,-71.65,41.35`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: { center?: [number, number] }[] };
    const c = data.features?.[0]?.center;
    if (!c || c.length < 2) return null;
    return { lng: c[0], lat: c[1] };
  } catch {
    return null;
  }
}

/**
 * Geocode any prospects missing coordinates and persist the results.
 * Runs server-side on page load; a no-op once everything has pins.
 */
export async function geocodeMissingProspects(): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("prospects")
    .select("id,name,address")
    .is("lat", null)
    .is("deleted_at", null)
    .limit(100);
  const missing = data ?? [];
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (p) => {
      const coords = await geocodeBusiness(p.name, p.address);
      if (coords) {
        await supabase.from("prospects").update(coords).eq("id", p.id);
      }
    })
  );
}
