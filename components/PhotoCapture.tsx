"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { enqueuePhoto, subscribeSync } from "@/lib/offline";

interface PhotoCaptureProps {
  stopId: string;
  existingPhotos: { id: string; url: string }[];
  onPhotoAdded: (url: string) => void;
}

interface Shot {
  id: string;
  url: string; // local object URL until synced, then the real one
  synced: boolean;
}

// Photo proof capture that never blocks on the network: the shot shows up (and
// counts toward completing the stop) the moment it's taken, and uploads in the
// background with retry — spotty Hamptons signal can't lose a photo or strand
// the driver on an "Uploading…" spinner.
export default function PhotoCapture({
  stopId,
  existingPhotos,
  onPhotoAdded,
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<Shot[]>(
    existingPhotos.map((p) => ({ ...p, synced: true }))
  );
  const [busy, setBusy] = useState(false); // compressing only, never uploading
  const inputRef = useRef<HTMLInputElement>(null);

  // When a queued photo for this stop finishes uploading, mark the oldest
  // pending shot as synced (uploads flush oldest-first).
  useEffect(() => {
    return subscribeSync((_state, event) => {
      if (event?.uploadedStopId !== stopId) return;
      setPhotos((cur) => {
        const idx = cur.findIndex((p) => !p.synced);
        if (idx === -1) return cur;
        const next = [...cur];
        next[idx] = { ...next[idx], synced: true, url: event.url || next[idx].url };
        return next;
      });
    });
  }, [stopId]);

  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const localUrl = await enqueuePhoto(stopId, compressed);
      setPhotos((p) => [...p, { id: `local-${Date.now()}`, url: localUrl, synced: false }]);
      onPhotoAdded(localUrl);
    } catch {
      // Compression failed (rare): queue the original file as-is.
      const localUrl = await enqueuePhoto(stopId, file);
      setPhotos((p) => [...p, { id: `local-${Date.now()}`, url: localUrl, synced: false }]);
      onPhotoAdded(localUrl);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pending = photos.filter((p) => !p.synced).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-body text-sm font-medium text-charcoal">
          Photos ({photos.length})
        </h3>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest px-4 py-2 rounded flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {busy ? "One sec…" : "Take Photo"}
        </button>
        {pending > 0 && (
          <span className="font-body text-[11px] text-gold-dark">
            {pending} syncing in background
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-cream-dark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Delivery photo" className="w-full h-full object-cover" />
              {!p.synced && (
                <span className="absolute bottom-1 right-1 bg-charcoal/70 text-cream text-[9px] font-body uppercase tracking-wide rounded px-1.5 py-0.5">
                  syncing
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
