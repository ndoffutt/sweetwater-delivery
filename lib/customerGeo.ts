import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode";

// Geocode active customers that have an address but no map pin, so every
// customer can be positioned in the route. Best-effort and capped per load;
// becomes a no-op once everyone is pinned.
export async function geocodeMissingCustomers(): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("id, address")
    .eq("active", true)
    .is("deleted_at", null)
    .is("lat", null)
    .not("address", "is", null)
    .limit(25);
  if (!data?.length) return;

  for (const c of data) {
    const coords = await geocodeAddress(c.address as string);
    if (coords) {
      await supabase
        .from("customers")
        .update({ lat: coords.lat, lng: coords.lng })
        .eq("id", c.id);
    }
  }
}
