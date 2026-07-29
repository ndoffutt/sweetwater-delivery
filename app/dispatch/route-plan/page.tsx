import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoadMatrix, milesBetween, coverage, shopPoint, type Point } from "@/lib/roadDistance";
import { optimizeWithCost } from "@/lib/optimize";
import RoutePlanView, { type RunPlan } from "@/components/RoutePlanView";
import type { DeliveryDay } from "@/lib/deliveryDay";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a cold cache needs ~26 Mapbox matrix calls per run

const RUNS: { day: DeliveryDay; label: string; blurb: string }[] = [
  { day: "wednesday", label: "Wednesday", blurb: "West run — Sag Harbor, Bridgehampton, Sagaponack" },
  { day: "thursday", label: "Thursday", blurb: "East run — East Hampton" },
];

export default async function RoutePlanPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dispatch");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("customers")
    .select("id,name,address,lat,lng,route_seq,delivery_days,out_of_range")
    .eq("active", true)
    .is("deleted_at", null)
    .not("lat", "is", null);

  type Row = {
    id: string; name: string; address: string | null;
    lat: number; lng: number; route_seq: number | null;
    delivery_days: string[] | null; out_of_range?: boolean | null;
  };
  const all = ((data ?? []) as Row[]).filter((c) => !c.out_of_range);

  const shop = shopPoint();
  const plans: RunPlan[] = [];

  for (const run of RUNS) {
    const grp = all
      .filter((c) => (c.delivery_days ?? []).includes(run.day))
      .sort((a, b) => (a.route_seq ?? 9e9) - (b.route_seq ?? 9e9));
    if (grp.length < 3) continue;

    // Index 0 is the shop; stops follow in their current order.
    const points: Point[] = [shop, ...grp.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng }))];
    const matrix = await getRoadMatrix(points);
    const cost = (a: number, b: number) => milesBetween(matrix, points[a], points[b]);

    const tourMiles = (order: number[]) => {
      if (order.length === 0) return 0;
      let m = cost(0, order[0] + 1);
      for (let i = 1; i < order.length; i++) m += cost(order[i - 1] + 1, order[i] + 1);
      return m + cost(order[order.length - 1] + 1, 0);
    };

    const currentOrder = grp.map((_, i) => i);
    const bestOrder = optimizeWithCost(grp.length, cost);

    plans.push({
      day: run.day,
      label: run.label,
      blurb: run.blurb,
      roadCoverage: Math.round(coverage(matrix, points) * 100),
      currentMiles: tourMiles(currentOrder),
      bestMiles: tourMiles(bestOrder),
      stops: grp.map((c) => ({
        id: c.id,
        name: c.name,
        town: c.address?.split(",")[1]?.trim() ?? "",
        lat: c.lat,
        lng: c.lng,
      })),
      order: bestOrder,
    });
  }

  return <RoutePlanView plans={plans} />;
}
