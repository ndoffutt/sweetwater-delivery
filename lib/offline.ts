"use client";

// Offline-first sync layer for the driver flow. Cell service in the Hamptons is
// spotty, so nothing the driver does should ever block on (or be lost to) the
// network:
//
//  - Photos:  stored as blobs in IndexedDB, uploaded in the background with
//             retry. They survive page reloads and app restarts.
//  - Actions: stop status changes (arrive / complete / skip / confirm toggles)
//             are applied optimistically in the UI; if the server call fails,
//             the action is queued in localStorage and replayed when the
//             connection returns.
//
// Both queues flush on: `online` event, tab becoming visible, a 20s interval
// while non-empty, and immediately after a new item is enqueued.

import {
  updateStopStatus,
  confirmDropoff,
  confirmPickup,
  setPickupNone,
  flagStop,
} from "@/lib/actions/stops";
import { completeProspectVisit, skipProspectVisit } from "@/lib/actions/prospectVisits";
import type { StopStatus } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────

export interface QueuedPhoto {
  id: string;
  stopId: string;
  blob: Blob;
  type: string;
  createdAt: number;
  // Which service the photo proves ('dropoff' | 'pickup'); undefined = legacy.
  photoKind?: string;
}

export type StopActionInput =
  | { kind: "status"; stopId: string; status: StopStatus }
  | { kind: "dropoff" | "pickup"; stopId: string; confirmed: boolean }
  | { kind: "pickupNone"; stopId: string; none: boolean }
  | { kind: "flag"; stopId: string; reason: string }
  // Prospect-visit stops carry the route_prospect_visits id + prospect id so the
  // server action can run on replay. stopId is the synthetic `pv-…` id, used only
  // as the compaction key.
  | { kind: "prospectVisit"; stopId: string; visitId: string; prospectId: string; notes: string; touchType: string }
  | { kind: "prospectSkip"; stopId: string; visitId: string; reason: string };

export type QueuedAction = StopActionInput & { id: string };

export interface SyncState {
  pendingPhotos: number;
  pendingActions: number;
  syncing: boolean;
}

// ── IndexedDB (photo blobs) ────────────────────────────────────

const DB_NAME = "sw-offline";
const PHOTO_STORE = "photos";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAll(): Promise<QueuedPhoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedPhoto[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(p: QueuedPhoto): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── localStorage (action replay queue) ─────────────────────────

const ACTION_KEY = "sw-action-queue";

function readActions(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(ACTION_KEY) || "[]") as QueuedAction[];
  } catch {
    return [];
  }
}

function writeActions(list: QueuedAction[]) {
  try {
    localStorage.setItem(ACTION_KEY, JSON.stringify(list));
  } catch {
    /* storage full / private mode: queue degrades to in-memory-only */
  }
}

// ── Listeners / state ──────────────────────────────────────────

type Listener = (state: SyncState, event?: { uploadedStopId?: string; url?: string; photoKind?: string }) => void;
const listeners = new Set<Listener>();
let syncing = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let wired = false;

async function emit(event?: { uploadedStopId?: string; url?: string; photoKind?: string }) {
  const photos = await idbAll().catch(() => []);
  const actions = readActions();
  const state: SyncState = {
    pendingPhotos: photos.length,
    pendingActions: actions.length,
    syncing,
  };
  listeners.forEach((l) => l(state, event));
  // Keep a periodic flush running only while there is work to do.
  if (photos.length + actions.length > 0) {
    if (!flushTimer) flushTimer = setInterval(() => void flush(), 20_000);
  } else if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

function wireGlobalTriggers() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
}

export function subscribeSync(l: Listener): () => void {
  wireGlobalTriggers();
  listeners.add(l);
  void emit();
  // Anything left over from a previous session starts uploading right away.
  void flush();
  return () => listeners.delete(l);
}

// ── Enqueue ────────────────────────────────────────────────────

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Queue a compressed photo for background upload. Returns a local preview URL. */
export async function enqueuePhoto(stopId: string, blob: Blob, photoKind?: "dropoff" | "pickup"): Promise<string> {
  const id = newId();
  await idbPut({ id, stopId, blob, type: blob.type || "image/jpeg", createdAt: Date.now(), photoKind });
  void emit();
  void flush();
  return URL.createObjectURL(blob);
}

/**
 * Run a stop mutation with offline fallback: fire the server action now; if it
 * fails (no signal, timeout), queue it for replay. The UI has already been
 * updated optimistically by the caller. Same-kind actions for the same stop are
 * compacted to last-wins so toggling offline doesn't pile up stale writes.
 */
export async function runStopAction(action: StopActionInput): Promise<void> {
  try {
    await dispatchAction({ ...action, id: "live" });
  } catch {
    const list = readActions().filter(
      (a) => !(a.stopId === action.stopId && a.kind === action.kind)
    );
    list.push({ ...action, id: newId() });
    writeActions(list);
    void emit();
  }
}

async function dispatchAction(a: QueuedAction): Promise<void> {
  let result: { error?: string } | undefined;
  if (a.kind === "status") result = await updateStopStatus(a.stopId, a.status);
  else if (a.kind === "dropoff") result = await confirmDropoff(a.stopId, a.confirmed);
  else if (a.kind === "pickup") result = await confirmPickup(a.stopId, a.confirmed);
  else if (a.kind === "pickupNone") result = await setPickupNone(a.stopId, a.none);
  else if (a.kind === "flag") result = await flagStop(a.stopId, a.reason);
  else if (a.kind === "prospectVisit") result = await completeProspectVisit(a.visitId, a.prospectId, a.notes, a.touchType);
  else if (a.kind === "prospectSkip") result = await skipProspectVisit(a.visitId, a.reason);
  // A server-side rejection (e.g. stop deleted because the route was cleared,
  // which surfaces as Supabase's "no rows returned") is permanent: don't keep
  // retrying it forever.
  // "column … does not exist" = the migration hasn't run; retrying won't help.
  if (result?.error && /not found|deleted|invalid|no rows|0 rows|multiple \(or no\)|column|schema cache/i.test(result.error)) return;
  if (result?.error) throw new Error(result.error);
}

// ── Flush ──────────────────────────────────────────────────────

export async function flush(): Promise<void> {
  if (syncing || typeof window === "undefined") return;
  if (!navigator.onLine) return;
  syncing = true;
  void emit();

  try {
    // Replay queued actions first (cheap, ordered), then photos.
    let actions = readActions();
    for (const a of actions) {
      try {
        await dispatchAction(a);
        actions = actions.filter((x) => x.id !== a.id);
        writeActions(actions);
        void emit();
      } catch {
        break; // still offline-ish; retry the rest next flush
      }
    }

    const photos = await idbAll().catch(() => [] as QueuedPhoto[]);
    for (const p of photos.sort((a, b) => a.createdAt - b.createdAt)) {
      try {
        const fd = new FormData();
        fd.append("photo", p.blob, "photo.jpg");
        fd.append("stopId", p.stopId);
        if (p.photoKind) fd.append("kind", p.photoKind);
        const res = await fetch("/api/photo", { method: "POST", body: fd });
        if (res.status === 400) {
          // Permanently invalid (e.g. stop no longer exists): drop it.
          await idbDelete(p.id);
          continue;
        }
        if (!res.ok) throw new Error(`upload ${res.status}`);
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        await idbDelete(p.id);
        void emit({ uploadedStopId: p.stopId, url: data.url, photoKind: p.photoKind });
      } catch {
        break; // network gone again; remaining photos wait for the next flush
      }
    }
  } finally {
    syncing = false;
    void emit();
  }
}
