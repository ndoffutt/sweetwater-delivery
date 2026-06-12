// Forward-geocode an address to coordinates via Mapbox, biased to the Hamptons.
// SPOT manifests don't carry lat/lng, so new customers are geocoded here so they
// can be positioned in the route and shown on the maps.

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const q = address?.trim();
  if (!TOKEN || !q) return null;
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${TOKEN}&limit=1&country=us&types=address&proximity=-72.2,40.96`;
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
