import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import Header from "@/components/Header";
import StopDetail from "@/components/StopDetail";
import type { StopPhoto } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StopPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();

  const { data: stop } = await supabase
    .from("route_stops")
    .select(`*, customer:customers(*), photos:stop_photos(*)`)
    .eq("id", params.id)
    .single();

  if (!stop) notFound();

  const photoUrls = ((stop.photos || []) as StopPhoto[]).map((p) => {
    const { data } = supabase.storage
      .from("stop-photos")
      .getPublicUrl(p.storage_path);
    return { id: p.id, url: data.publicUrl };
  });

  return (
    <>
      <Header
        title={stop.customer?.name || "Stop"}
        subtitle={`Stop ${stop.stop_order}`}
        userName={session.name}
        backHref="/driver"
      />
      <StopDetail stop={stop} photoUrls={photoUrls} />
    </>
  );
}
