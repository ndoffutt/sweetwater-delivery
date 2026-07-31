// Dev-only preview harness.
//
// Renders the messaging inbox against stubbed API responses so the UI can be
// opened and screenshotted with no database and no network - which is the only
// way to actually look at this thing from a sandboxed session. Drive it with
// `node scripts/screenshot.mjs` while `npm run dev` is running.
//
// Returns 404 in production so it can never be reached on the live app.
"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import MessagesView from "@/components/MessagesView";

const NOW = Date.parse("2026-07-31T17:40:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const THREADS = [
  {
    phone: "+16315550118", digits: "6315550118", name: "Tori Eisenberg",
    nameSource: "customer", customerId: "c1",
    lastBody: "Perfect, thank you! Leave it inside the porch door if we're out.",
    lastAt: ago(4), lastDirection: "inbound", unread: 2, pinned: true, archived: false,
  },
  {
    phone: "+16315550142", digits: "6315550142", name: "Molly Sims Stuber",
    nameSource: "customer", customerId: "c2",
    lastBody: "Your delivery is on the way, about 20 minutes out.",
    lastAt: ago(38), lastDirection: "outbound", unread: 0, pinned: false, archived: false,
  },
  {
    phone: "+16315550177", digits: "6315550177", name: "Bridgehampton Club",
    nameSource: "prospect", customerId: null,
    lastBody: "Can you quote linen service for 40 covers?",
    lastAt: ago(190), lastDirection: "inbound", unread: 1, pinned: false, archived: false,
  },
  {
    phone: "+16315550163", digits: "6315550163", name: null,
    nameSource: null, customerId: null,
    lastBody: "wrong number sorry",
    lastAt: ago(1500), lastDirection: "inbound", unread: 0, pinned: false, archived: false,
  },
];

const MESSAGES = [
  { id: "m1", direction: "outbound", phone: "+16315550118", body: "Good morning! You're on today's route, about 11:40.", sender_name: "Nate", status: "delivered", created_at: ago(200) },
  { id: "m2", direction: "inbound", phone: "+16315550118", body: "Great. Two comforters going back today as well.", sender_name: null, status: "received", created_at: ago(188) },
  { id: "m3", direction: "outbound", phone: "+16315550118", body: "Got it, I'll note the pickup.", sender_name: "Nate", status: "delivered", created_at: ago(186), reaction: "like" },
  { id: "m4", direction: "outbound", phone: "+16315550118", body: "Delivered! Photo and item list here: sweetwaterscleaners.com/d/a8f3", sender_name: "Auto", status: "delivered", created_at: ago(9) },
  { id: "m5", direction: "inbound", phone: "+16315550118", body: "Perfect, thank you! Leave it inside the porch door if we're out.", sender_name: null, status: "received", created_at: ago(4), reply_to_id: "m4" },
];

export default function DevPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const real = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
      if (url.includes("/api/messages?contacts=1"))
        return json({ contacts: THREADS.filter((t) => t.name).map((t) => ({ digits: t.digits, name: t.name, source: t.nameSource, customerId: t.customerId })) });
      if (url.includes("/api/messages?phone=")) return json({ messages: MESSAGES, contact: { digits: "6315550118", name: "Tori Eisenberg", source: "customer", customerId: "c1" } });
      if (url.includes("/api/messages")) return json({ threads: THREADS, configured: true });
      return real(input as RequestInfo, init);
    }) as typeof window.fetch;
    setReady(true);
  }, []);

  if (!ready) return null;
  return <MessagesView canCall />;
}
