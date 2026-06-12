import { verifyTrackToken } from "@/lib/track";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeEtaMinutes } from "@/lib/geo";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track your delivery · Sweetwater's Cleaners" };

interface TrackStop {
  id: string;
  stop_order: number;
  status: string;
  arrived_at: string | null;
  completed_at: string | null;
  customers: { name: string; lat: number | null; lng: number | null } | null;
}

const firstName = (n: string) =>
  n.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "").split(/[\s/,]/)[0] || n;

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

// Public, tokenized delivery tracker. Shows only this customer's status and a
// coarse "N stops away / rough ETA" - never other customers' names or addresses.
export default async function TrackPage({ params }: { params: { token: string } }) {
  const stopId = verifyTrackToken(params.token);

  let view:
    | { kind: "invalid" }
    | { kind: "scheduled"; name: string }
    | { kind: "enroute"; name: string; ahead: number; etaMin: number }
    | { kind: "here"; name: string }
    | { kind: "done"; name: string; at: string | null }
    | { kind: "missed"; name: string } = { kind: "invalid" };

  if (stopId) {
    const supabase = createAdminClient();
    const { data: stop } = await supabase
      .from("route_stops")
      .select("id, route_id, stop_order, status, arrived_at, completed_at, customers(name)")
      .eq("id", stopId)
      .maybeSingle();

    if (stop) {
      const me = stop as unknown as TrackStop & { route_id: string };
      const name = firstName(me.customers?.name ?? "there");

      if (me.status === "arrived") view = { kind: "here", name };
      else if (me.status === "completed") view = { kind: "done", name, at: me.completed_at };
      else if (me.status === "skipped") view = { kind: "missed", name };
      else {
        // Pending: figure out where the driver is in the run.
        const { data: routeRow } = await supabase
          .from("routes")
          .select("status, route_stops(id, stop_order, status, arrived_at, completed_at, customers(lat, lng))")
          .eq("id", me.route_id)
          .maybeSingle();
        const route = routeRow as unknown as { status: string; route_stops: TrackStop[] } | null;

        if (!route || route.status === "draft" || route.status === "dispatched") {
          view = { kind: "scheduled", name };
        } else {
          const stops = [...(route.route_stops ?? [])].sort((a, b) => a.stop_order - b.stop_order);
          const ahead = stops.filter(
            (s) => s.stop_order < me.stop_order && (s.status === "pending" || s.status === "arrived")
          ).length;
          // Rough ETA: drive time through the remaining chain up to this stop,
          // plus dwell at each stop ahead (lib/geo's per-stop dwell handles it).
          const myIdx = stops.findIndex((s) => s.id === me.id);
          const chain = stops
            .slice(0, myIdx + 1)
            .filter((s) => s.status === "pending" || s.status === "arrived")
            .map((s) =>
              s.customers?.lat != null && s.customers?.lng != null
                ? { lat: s.customers.lat, lng: s.customers.lng }
                : null
            );
          const etaMin = Math.max(5, Math.round(routeEtaMinutes(chain)));
          view = { kind: "enroute", name, ahead, etaMin };
        }
      }
    }
  }

  const live = view.kind === "enroute" || view.kind === "scheduled" || view.kind === "here";

  return (
    <main className="min-h-screen bg-green-primary flex items-center justify-center p-6">
      {live && <AutoRefresh seconds={60} />}
      <div className="w-full max-w-sm bg-cream rounded-2xl shadow-xl p-8 text-center">
        <div className="font-serif text-3xl font-light text-charcoal">Sweetwater&apos;s</div>
        <div className="font-body text-[10px] uppercase tracking-[0.3em] text-gold-dark mt-1 mb-8">
          Delivery
        </div>

        {view.kind === "invalid" && (
          <p className="font-body text-sm text-charcoal/60">
            This tracking link isn&apos;t valid anymore.
          </p>
        )}

        {view.kind === "scheduled" && (
          <>
            <div className="font-serif text-2xl font-light text-charcoal">Hi {view.name}!</div>
            <p className="font-body text-sm text-charcoal/60 mt-3 leading-relaxed">
              Your delivery is scheduled for today. This page will update once the van is on the
              road.
            </p>
          </>
        )}

        {view.kind === "enroute" && (
          <>
            <div className="font-serif text-2xl font-light text-charcoal">
              Hi {view.name}, we&apos;re on the way!
            </div>
            <div className="my-6">
              <div className="font-serif text-6xl font-light text-green-primary leading-none">
                {view.ahead}
              </div>
              <div className="font-body text-[11px] uppercase tracking-widest text-charcoal/45 mt-2">
                {view.ahead === 1 ? "stop" : "stops"} ahead of you
              </div>
            </div>
            <p className="font-body text-sm text-charcoal/60">
              Estimated arrival in about <b className="text-charcoal">{view.etaMin} min</b>
            </p>
          </>
        )}

        {view.kind === "here" && (
          <>
            <div className="font-serif text-2xl font-light text-green-primary">
              We&apos;re here, {view.name}!
            </div>
            <p className="font-body text-sm text-charcoal/60 mt-3">
              Your driver has arrived with your delivery.
            </p>
          </>
        )}

        {view.kind === "done" && (
          <>
            <div className="w-14 h-14 rounded-full bg-green-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-green-primary">✓</span>
            </div>
            <div className="font-serif text-2xl font-light text-charcoal">
              Delivered{view.at ? ` at ${fmtTime(view.at)}` : ""}
            </div>
            <p className="font-body text-sm text-charcoal/60 mt-3">
              Thank you, {view.name}! Reply to our text anytime if anything&apos;s not right.
            </p>
          </>
        )}

        {view.kind === "missed" && (
          <>
            <div className="font-serif text-2xl font-light text-charcoal">
              We missed you, {view.name}
            </div>
            <p className="font-body text-sm text-charcoal/60 mt-3">
              We couldn&apos;t complete your stop today. We&apos;ll be in touch to reschedule, or
              reply to our text.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
