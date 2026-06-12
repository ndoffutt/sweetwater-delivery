import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLastManifestScan } from "@/lib/actions/manifest";
import { easternToday } from "@/lib/date";
import DispatchConsole, { type InitialStop } from "@/components/DispatchConsole";

export const dynamic = "force-dynamic";

interface RawStop {
  status: string;
  stop_order: number;
  has_dropoff: boolean;
  has_pickup: boolean;
  notes: string | null;
  piece_count: number | null;
  customers: {
    id: string;
    name: string;
    address: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    tags: string[] | null;
    delivery_day?: "wednesday" | "thursday" | null;
  } | null;
}

const townOf = (a: string) => a.split(",")[1]?.trim() ?? "";

export default async function DispatchPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const supabase = createAdminClient();
  const today = easternToday();
  // Weekday of the route date (date-only math, timezone-proof).
  const dispatchDow = new Date(today + "T12:00:00Z").getUTCDay();

  const routeSelect = (withDay: boolean) =>
    supabase
      .from("routes")
      .select(
        `id,status,date,route_stops(stop_order,status,has_dropoff,has_pickup,notes,piece_count,customers(id,name,address,phone,lat,lng,tags${withDay ? ",delivery_day" : ""}))`
      )
      .eq("date", today)
      .is("deleted_at", null)
      .order("stop_order", { referencedTable: "route_stops" })
      .maybeSingle();

  const customersSelect = (withDay: boolean) =>
    supabase
      .from("customers")
      .select(`id,name,address,phone,lat,lng,route_seq,tags${withDay ? ",delivery_day" : ""}`)
      .eq("active", true)
      .is("deleted_at", null)
      .order("name");

  const [routeRes, { data: driver }, lastScan, { count: signupCount }, { data: masterRows }, customersRes] = await Promise.all([
    routeSelect(true),
    supabase
      .from("users")
      .select("name")
      .eq("role", "driver")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    getLastManifestScan(),
    supabase
      .from("customer_signups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("customers")
      .select("name,lat,lng,route_seq")
      .eq("active", true)
      .is("deleted_at", null)
      .not("route_seq", "is", null)
      .order("route_seq"),
    customersSelect(true),
  ]);

  // Tolerant of the delivery_day migration not having run yet.
  const route = routeRes.error ? (await routeSelect(false)).data : routeRes.data;
  const allCustomerRows = customersRes.error
    ? (await customersSelect(false)).data
    : customersRes.data;

  const stops: InitialStop[] = (((route?.route_stops ?? []) as unknown) as RawStop[])
    .filter((s) => s.customers)
    .map((s) => ({
      customerId: s.customers!.id,
      name: s.customers!.name,
      address: s.customers!.address,
      town: townOf(s.customers!.address),
      phone: s.customers!.phone,
      has_dropoff: s.has_dropoff,
      has_pickup: s.has_pickup,
      notes: s.notes,
      pieces: s.piece_count ?? 0,
      lat: s.customers!.lat,
      lng: s.customers!.lng,
      vip: (s.customers!.tags ?? []).includes("VIP"),
      day: s.customers!.delivery_day ?? null,
    }));

  const masterRoute = ((masterRows ?? []) as { name: string; lat: number | null; lng: number | null; route_seq: number }[])
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({ name: c.name, lat: c.lat as number, lng: c.lng as number, seq: c.route_seq }));

  const allCustomers = (((allCustomerRows ?? []) as unknown) as {
    id: string; name: string; address: string; phone: string | null;
    lat: number | null; lng: number | null; route_seq: number | null; tags: string[] | null;
    delivery_day?: "wednesday" | "thursday" | null;
  }[]).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    phone: c.phone,
    lat: c.lat,
    lng: c.lng,
    route_seq: c.route_seq,
    vip: (c.tags ?? []).includes("VIP"),
    delivery_day: c.delivery_day ?? null,
  }));

  const dateLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <DispatchConsole
      dateLabel={dateLabel}
      driverName={driver?.name ?? "Driver"}
      lastScan={lastScan}
      pendingSignups={signupCount ?? 0}
      masterRoute={masterRoute}
      allCustomers={allCustomers}
      dispatchDow={dispatchDow}
      today={route ? { id: route.id, status: route.status, stops } : null}
    />
  );
}
