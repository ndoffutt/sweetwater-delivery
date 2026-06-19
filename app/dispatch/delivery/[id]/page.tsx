import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import DeliveryDetail from "@/components/DeliveryDetail";

export const dynamic = "force-dynamic";

export default async function DeliveryDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "driver") redirect("/driver");

  const supabase = createAdminClient();
  const { data: stop } = await supabase
    .from("route_stops")
    .select(
      "id, status, has_dropoff, has_pickup, piece_count, notes, arrived_at, completed_at, customers(name, address, phone), routes(date), stop_photos(storage_path)"
    )
    .eq("id", params.id)
    .single();

  if (!stop) notFound();

  const photoUrl = (p: string) => supabase.storage.from("stop-photos").getPublicUrl(p).data.publicUrl;
  const s = stop as unknown as {
    id: string; status: string; has_dropoff: boolean; has_pickup: boolean;
    piece_count: number | null; notes: string | null; arrived_at: string | null;
    completed_at: string | null;
    customers: { name: string; address: string; phone: string | null } | null;
    routes: { date: string } | null;
    stop_photos: { storage_path: string }[] | null;
  };

  return (
    <DeliveryDetail
      stop={{
        id: s.id,
        status: s.status,
        hasDropoff: s.has_dropoff,
        hasPickup: s.has_pickup,
        pieceCount: s.piece_count ?? 0,
        notes: s.notes,
        arrivedAt: s.arrived_at,
        completedAt: s.completed_at,
        customerName: s.customers?.name ?? "Customer",
        address: s.customers?.address ?? "",
        phone: s.customers?.phone ?? null,
        date: s.routes?.date ?? null,
        photos: (s.stop_photos ?? []).map((p) => photoUrl(p.storage_path)),
      }}
    />
  );
}
