import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeMissingCustomers } from "@/lib/customerGeo";
import CustomerDirectory, { type Activity } from "@/components/CustomerDirectory";
import type { Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StopRow {
  id: string;
  customer_id: string | null;
  completed_at: string | null;
  has_dropoff: boolean;
  has_pickup: boolean;
  piece_count: number | null;
  stop_photos: { storage_path: string }[] | null;
  routes: { date: string } | null;
}

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect("/");

  // Pin any customers missing coordinates so each can get a route spot (no-op
  // once all are geocoded).
  await geocodeMissingCustomers().catch(() => {});

  const supabase = createAdminClient();

  const baseCols =
    "id,name,address,phone,gate_code,delivery_notes,tags,spot_account,account_type,route_seq,lat,lng,active,created_at";
  // delivery_days is optional (tolerant of the migration not having run yet).
  let { data: customers } = await supabase
    .from("customers")
    .select(`${baseCols},delivery_days`)
    .eq("active", true)
    .is("deleted_at", null)
    .order("name");
  if (!customers) {
    const retry = await supabase
      .from("customers")
      .select(baseCols)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");
    customers = retry.data as typeof customers;
  }

  const { data: stops } = await supabase
    .from("route_stops")
    .select("id,customer_id,completed_at,has_dropoff,has_pickup,piece_count,stop_photos(storage_path),routes(date)")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(600);

  const photoUrl = (p: string) =>
    supabase.storage.from("stop-photos").getPublicUrl(p).data.publicUrl;

  const activity: Record<string, Activity[]> = {};
  for (const s of (stops ?? []) as unknown as StopRow[]) {
    if (!s.customer_id || !s.completed_at) continue;
    (activity[s.customer_id] ??= []).push({
      id: s.id,
      date: s.completed_at,
      dropoff: s.has_dropoff,
      pickup: s.has_pickup,
      pieces: s.piece_count ?? 0,
      photos: (s.stop_photos ?? []).map((p) => photoUrl(p.storage_path)),
    });
  }

  return (
    <CustomerDirectory
      customers={(customers ?? []) as Customer[]}
      activity={activity}
    />
  );
}
