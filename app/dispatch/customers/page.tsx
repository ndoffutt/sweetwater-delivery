import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeMissingCustomers } from "@/lib/customerGeo";
import { outOfRangeIdSet } from "@/lib/customerRange";
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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: { id?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  // Pin any customers missing coordinates so each can get a route spot (no-op
  // once all are geocoded).
  await geocodeMissingCustomers().catch(() => {});

  const supabase = createAdminClient();

  const baseCols =
    "id,name,address,phone,gate_code,delivery_notes,tags,spot_account,account_type,route_seq,lat,lng,active,created_at";
  // delivery_days and auto_texts_enabled each arrive with their own migration,
  // so step the fallback rather than dropping straight to the base columns —
  // one missing column must not also cost us the other's data (that would
  // silently blank the delivery-day chips).
  // Dynamic column lists defeat supabase-js's generic inference, so unwrap to
  // the shape we actually asked for.
  const selectCustomers = async (cols: string): Promise<Customer[] | null> => {
    const { data } = await supabase
      .from("customers")
      .select(cols)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");
    return (data as unknown as Customer[] | null) ?? null;
  };

  let customers = await selectCustomers(`${baseCols},delivery_days,auto_texts_enabled`);
  if (!customers) customers = await selectCustomers(`${baseCols},delivery_days`);
  if (!customers) customers = await selectCustomers(baseCols);

  // Which of these customers are shelved as out of range (tolerant of the
  // column not existing yet). Merged onto each row below so the directory can
  // mark, filter, and restore them without a schema-dependent select.
  const oorSet = await outOfRangeIdSet(supabase);

  const { data: stops } = await supabase
    .from("route_stops")
    .select("id,customer_id,completed_at,has_dropoff,has_pickup,piece_count,stop_photos(storage_path),routes(date)")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(2000);

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
      customers={((customers ?? []) as Customer[]).map((c) => ({ ...c, out_of_range: oorSet.has(c.id) }))}
      activity={activity}
      initialSelectedId={searchParams?.id ?? null}
    />
  );
}
