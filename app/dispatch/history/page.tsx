import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import HistoryView, { type HistoryRoute } from "@/components/HistoryView";

export const dynamic = "force-dynamic";

interface RawStop {
  stop_order: number;
  status: string;
  arrived_at: string | null;
  completed_at: string | null;
  dropoff_confirmed: boolean;
  pickup_confirmed: boolean;
  notes: string | null;
  piece_count: number | null;
  customers: { name: string; address: string } | null;
  stop_photos: { storage_path: string }[] | null;
}
interface RawRoute {
  id: string;
  date: string;
  completed_at: string | null;
  route_stops: RawStop[] | null;
}

export default async function HistoryPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("routes")
    .select(
      "id,date,completed_at,route_stops(stop_order,status,arrived_at,completed_at,dropoff_confirmed,pickup_confirmed,notes,piece_count,customers(name,address),stop_photos(storage_path))"
    )
    .eq("status", "completed")
    .order("date", { ascending: false })
    .order("stop_order", { referencedTable: "route_stops" })
    .limit(40);

  const photoUrl = (p: string) =>
    supabase.storage.from("stop-photos").getPublicUrl(p).data.publicUrl;

  const routes: HistoryRoute[] = ((data ?? []) as unknown as RawRoute[]).map((r) => ({
    id: r.id,
    date: r.date,
    completedAt: r.completed_at,
    stops: (r.route_stops ?? []).map((s) => ({
      order: s.stop_order,
      name: s.customers?.name ?? "Unknown",
      address: s.customers?.address ?? "",
      status: s.status,
      arrivedAt: s.arrived_at,
      completedAt: s.completed_at,
      dropoff: s.dropoff_confirmed,
      pickup: s.pickup_confirmed,
      notes: s.notes,
      pieces: s.piece_count ?? 0,
      photos: (s.stop_photos ?? []).map((p) => photoUrl(p.storage_path)),
    })),
  }));

  return <HistoryView routes={routes} />;
}
