"use client";

// Shared "recent messages" block for a customer — used in the dispatch stop
// popup, the customer directory, and the driver's stop sheet. Read-only:
// anyone with an active session can see it (getCustomerMessages enforces
// only that), but the "open full thread" link goes to the Messages inbox,
// which stays admin/dispatcher-only — canOpenThread hides it for a driver.
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomerMessages, type CustomerMessage } from "@/lib/actions/messages";

export default function MessagePreview({
  customerId,
  phone,
  name,
  canOpenThread = true,
}: {
  customerId: string;
  phone: string | null;
  name: string;
  canOpenThread?: boolean;
}) {
  const [messages, setMessages] = useState<CustomerMessage[] | null>(null);

  useEffect(() => {
    let live = true;
    getCustomerMessages(customerId)
      .then((rows) => { if (live) setMessages(rows); })
      .catch(() => { if (live) setMessages([]); });
    return () => { live = false; };
  }, [customerId]);

  return (
    <div>
      <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mb-2">
        Messages{messages && messages.length ? ` · ${messages.length}` : ""}
      </p>
      {messages === null ? (
        <p className="text-sm text-charcoal/40 font-body">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-charcoal/40 font-body">No messages yet.</p>
      ) : (
        <div className="space-y-1.5">
          {[...messages].reverse().map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-2.5 text-xs font-body ${
                m.direction === "inbound"
                  ? "bg-white/60 border-cream-dark"
                  : "bg-green-primary/10 border-green-primary/20"
              }`}
            >
              <p className="text-charcoal/80 whitespace-pre-wrap">{m.body}</p>
              <p className="text-charcoal/35 mt-1">
                {m.direction === "inbound" ? "Them" : m.sender_name || "Us"} ·{" "}
                {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {m.status === "failed" && <span className="text-red-600"> · failed</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      {phone && canOpenThread && (
        <Link
          href={`/dispatch/messages?open=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`}
          className="inline-block mt-2 font-body text-xs text-charcoal/50 underline underline-offset-2"
        >
          {messages && messages.length > 0 ? "Open full thread →" : "Start a conversation →"}
        </Link>
      )}
    </div>
  );
}
