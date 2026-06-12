"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RouteStop } from "@/lib/types";
import { sendSms } from "@/lib/actions/stops";
import { saveCustomerNotes } from "@/lib/actions/customers";
import { runStopAction } from "@/lib/offline";
import PhotoCapture from "./PhotoCapture";

interface StopDetailProps {
  stop: RouteStop;
  photoUrls: { id: string; url: string }[];
}

export default function StopDetail({ stop: initial, photoUrls }: StopDetailProps) {
  const [stop, setStop] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState(
    `Hi! Your Sweetwater's delivery is on the way. We'll be there shortly.`
  );
  const [smsSent, setSmsSent] = useState(false);
  const router = useRouter();
  const customer = stop.customer!;

  const [gateCode, setGateCode] = useState(customer.gate_code || "");
  const [notes, setNotes] = useState(customer.delivery_notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const notesDirty =
    gateCode !== (customer.gate_code || "") ||
    notes !== (customer.delivery_notes || "");

  async function handleSaveNotes() {
    setSavingNotes(true);
    setNotesSaved(false);
    const result = await saveCustomerNotes(customer.id, {
      gate_code: gateCode.trim() || null,
      delivery_notes: notes.trim() || null,
    });
    setSavingNotes(false);
    if (!result.error) {
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    }
  }

  function handleStatusChange(status: "arrived" | "completed" | "skipped") {
    setStop((s) => ({ ...s, status }));
    startTransition(async () => {
      // Offline-safe: applies now, queues for replay if there's no signal.
      await runStopAction({ kind: "status", stopId: stop.id, status });
      router.refresh();
    });
  }

  function handleDropoff(confirmed: boolean) {
    setStop((s) => ({ ...s, dropoff_confirmed: confirmed }));
    startTransition(async () => {
      await runStopAction({ kind: "dropoff", stopId: stop.id, confirmed });
    });
  }

  function handlePickup(confirmed: boolean) {
    setStop((s) => ({ ...s, pickup_confirmed: confirmed }));
    startTransition(async () => {
      await runStopAction({ kind: "pickup", stopId: stop.id, confirmed });
    });
  }

  function handleSendSms() {
    startTransition(async () => {
      const result = await sendSms(stop.id, smsMessage);
      if (!result.error) {
        setSmsSent(true);
        setSmsOpen(false);
      }
    });
  }

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(customer.address)}`;

  return (
    <div className="p-4 space-y-5">
      {/* Customer Info */}
      <div className="bg-cream rounded-xl p-5 border border-cream-dark">
        <h2 className="font-serif text-2xl font-light text-charcoal mb-1">
          {customer.name}
        </h2>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-green-primary font-body underline underline-offset-2"
        >
          {customer.address} →
        </a>

        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="block mt-2 text-sm text-charcoal/70 font-body"
          >
            📞 {customer.phone}
          </a>
        )}

        {/* Gate Code: editable, persists to the customer */}
        <div className="mt-4 bg-gold-primary/10 border border-gold-primary/30 rounded-lg p-3">
          <label className="text-xs text-gold-dark font-body uppercase tracking-widest mb-1 block">
            Gate Code
          </label>
          <input
            value={gateCode}
            onChange={(e) => setGateCode(e.target.value)}
            placeholder="None on file"
            className="w-full bg-transparent text-2xl font-body font-semibold text-charcoal tracking-wider focus:outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-charcoal/30"
          />
        </div>

        {/* Delivery Notes: editable, persists to the customer */}
        <div className="mt-3 bg-green-primary/5 border border-green-primary/20 rounded-lg p-3">
          <label className="text-xs text-green-primary font-body uppercase tracking-widest mb-1 block">
            Delivery Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add a note that saves to this customer…"
            className="w-full bg-transparent text-sm font-body text-charcoal resize-none focus:outline-none placeholder:text-charcoal/30"
          />
        </div>

        {notesDirty && (
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes}
            className="mt-3 w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60"
          >
            {savingNotes ? "Saving…" : "Save to Customer"}
          </button>
        )}
        {notesSaved && (
          <p className="text-center text-xs text-green-primary font-body mt-2">
            ✓ Saved, will show on every future route
          </p>
        )}
      </div>

      {/* Actions based on status */}
      {stop.status === "pending" && (
        <div className="space-y-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full min-h-tap bg-gold-primary text-charcoal font-body text-sm uppercase tracking-widest text-center py-4 rounded-xl"
          >
            Navigate →
          </a>
          <button
            onClick={() => handleStatusChange("arrived")}
            disabled={isPending}
            className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-4 rounded-xl"
          >
            I&apos;m Here
          </button>
        </div>
      )}

      {stop.status === "arrived" && (
        <div className="space-y-4">
          {/* Dropoff / Pickup toggles: available at every stop */}
          <div className="flex gap-3">
            <button
              onClick={() => handleDropoff(!stop.dropoff_confirmed)}
              className={`flex-1 min-h-tap rounded-xl font-body text-sm uppercase tracking-widest py-4 border-2 transition-all ${
                stop.dropoff_confirmed
                  ? "bg-green-primary border-green-primary text-cream"
                  : "border-green-primary text-green-primary"
              }`}
            >
              ↓ {stop.dropoff_confirmed ? "Dropped Off ✓" : "Confirm Drop-off"}
            </button>
            <button
              onClick={() => handlePickup(!stop.pickup_confirmed)}
              className={`flex-1 min-h-tap rounded-xl font-body text-sm uppercase tracking-widest py-4 border-2 transition-all ${
                stop.pickup_confirmed
                  ? "bg-green-primary border-green-primary text-cream"
                  : "border-green-primary text-green-primary"
              }`}
            >
              ↑ {stop.pickup_confirmed ? "Picked Up ✓" : "Confirm Pick-up"}
            </button>
          </div>

          {/* Photos */}
          <PhotoCapture
            stopId={stop.id}
            existingPhotos={photoUrls}
            onPhotoAdded={() => {}}
          />

          {/* SMS */}
          {customer.phone && !smsSent && (
            <div>
              {smsOpen ? (
                <div className="bg-cream rounded-xl p-4 border border-cream-dark space-y-3">
                  <textarea
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    rows={3}
                    className="w-full p-3 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSendSms}
                      disabled={isPending}
                      className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg"
                    >
                      Send Text
                    </button>
                    <button
                      onClick={() => setSmsOpen(false)}
                      className="min-h-tap px-4 text-charcoal/50 font-body text-xs uppercase tracking-widest"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSmsOpen(true)}
                  className="w-full min-h-tap border-2 border-cream-dark text-charcoal/70 font-body text-sm uppercase tracking-widest py-3 rounded-xl"
                >
                  💬 Send Text to Customer
                </button>
              )}
            </div>
          )}
          {smsSent && (
            <p className="text-center text-sm text-green-primary font-body">
              ✓ Text message sent
            </p>
          )}

          {/* Complete */}
          <button
            onClick={() => handleStatusChange("completed")}
            disabled={isPending}
            className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-4 rounded-xl"
          >
            Complete Stop ✓
          </button>
        </div>
      )}

      {stop.status === "completed" && (
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-green-primary/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">✓</span>
          </div>
          <p className="font-body text-green-primary font-medium">
            Stop Completed
          </p>
          {stop.arrived_at && (
            <p className="text-xs text-charcoal/40 font-body mt-1">
              Arrived{" "}
              {new Date(stop.arrived_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {stop.completed_at && (
            <p className="text-xs text-charcoal/60 font-body">
              Delivered{" "}
              {new Date(stop.completed_at).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      )}

      {stop.status === "skipped" && (
        <div className="text-center py-6">
          <p className="font-body text-charcoal/40">Stop Skipped</p>
        </div>
      )}

      {/* Skip button (always visible unless completed/skipped) */}
      {(stop.status === "pending" || stop.status === "arrived") && (
        <button
          onClick={() => handleStatusChange("skipped")}
          disabled={isPending}
          className="w-full min-h-tap text-charcoal/30 font-body text-xs uppercase tracking-widest py-3"
        >
          Skip This Stop
        </button>
      )}
    </div>
  );
}
