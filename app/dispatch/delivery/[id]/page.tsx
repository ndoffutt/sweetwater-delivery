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
      // Wildcard so new columns (pickup_none, stop_photos.kind) flow through
      // and their absence pre-migration can't break the query.
      "*, customers(id, name, address, phone), routes(date), stop_photos(*)"
    )
    .eq("id", params.id)
    .single();

  if (!stop) notFound();

  const photoUrl = (p: string) => supabase.storage.from("stop-photos").getPublicUrl(p).data.publicUrl;
  const s = stop as unknown as {
    id: string; status: string; has_dropoff: boolean; has_pickup: boolean;
    piece_count: number | null; notes: string | null; arrived_at: string | null;
    completed_at: string | null;
    dropoff_confirmed: boolean | null; pickup_confirmed: boolean | null; pickup_none?: boolean | null; dropoff_none?: boolean | null;
    customers: { id: string; name: string; address: string; phone: string | null } | null;
    routes: { date: string } | null;
    stop_photos: { storage_path: string; kind?: "dropoff" | "pickup" | null }[] | null;
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
        customerId: s.customers?.id ?? null,
        customerName: s.customers?.name ?? "Customer",
        address: s.customers?.address ?? "",
        phone: s.customers?.phone ?? null,
        date: s.routes?.date ?? null,
        dropoffConfirmed: !!s.dropoff_confirmed,
        pickupConfirmed: !!s.pickup_confirmed,
        pickupNone: !!s.pickup_none,
        dropoffNone: !!s.dropoff_none,
        photos: (s.stop_photos ?? []).map((p) => ({ url: photoUrl(p.storage_path), kind: p.kind ?? null })),
      }}
    />
  );
}
