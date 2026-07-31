// Dev-only preview harness for the driver flow.
//
// Renders DriverMap against fixed stops with the network stubbed out, so the
// screen where proof photos actually get lost can be opened and tested without
// a database. Drive it with `node scripts/driver-check.mjs`.
//
// 404s in production.
"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import DriverMap from "@/components/DriverMap";
import type { Customer, RouteStop } from "@/lib/types";

const customer = (name: string, address: string): Customer => ({
  id: `cust-${name.replace(/\W/g, "")}`,
  name,
  address,
  phone: "+16315550118",
  lat: 40.94,
  lng: -72.3,
  tags: [],
  active: true,
  gate_code: null,
  delivery_notes: null,
  spot_account: null,
  account_type: null,
  route_seq: null,
  created_at: "2026-01-01T00:00:00Z",
});

const stop = (over: Partial<RouteStop> & { id: string; stop_order: number }): RouteStop =>
  ({
    route_id: "route-1",
    customer_id: "c",
    status: "pending",
    has_dropoff: true,
    has_pickup: false,
    dropoff_confirmed: false,
    pickup_confirmed: false,
    notes: null,
    arrived_at: null,
    completed_at: null,
    created_at: "2026-07-31T12:00:00Z",
    photos: [],
    ...over,
  }) as RouteStop;

const STOPS: RouteStop[] = [
  stop({
    id: "stop-1",
    stop_order: 1,
    has_dropoff: true,
    has_pickup: true,
    customer: customer("Tori Eisenberg", "106 Osprey Way, Bridgehampton, NY 11976"),
  }),
  stop({
    id: "stop-2",
    stop_order: 2,
    has_dropoff: false,
    has_pickup: true,
    customer: customer("Molly Sims Stuber", "12 Mecox Rd, Water Mill, NY 11976"),
  }),
  stop({
    id: "stop-3",
    stop_order: 3,
    status: "completed",
    has_dropoff: true,
    has_pickup: false,
    dropoff_confirmed: true,
    arrived_at: "2026-07-31T14:00:00Z",
    completed_at: "2026-07-31T14:06:00Z",
    customer: customer("Bob Novak", "4 Bathgate Rd, Wainscott, NY 11975"),
  }),
];

export default function DriverPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [ready, setReady] = useState(false);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const json = (b: unknown) =>
        new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
      // Keep the driver page off the network entirely.
      if (url.includes("/api/driver/route-stops")) return json({ ids: STOPS.map((s) => s.id) });
      if (url.includes("/api/photo/sign")) return json({ path: "stop-1/1.jpg", signedUrl: "/dev-preview/sink" });
      if (url.includes("/api/photo/record")) return json({ success: true, url: "/icon.png" });
      if (url.includes("/api/photo")) return json({ success: true, url: "/icon.png" });
      if (url.includes("/api/location")) return json({ ok: true });
      if (url.includes("/dev-preview/sink")) return new Response("", { status: 200 });
      return real(input as RequestInfo, init);
    }) as typeof window.fetch;
    setReady(true);
  }, []);

  if (!ready) return null;
  return <DriverMap initialStops={STOPS} isManager={false} routeId="route-1" />;
}
