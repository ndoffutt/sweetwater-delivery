// Regression tests for the photo upload queue.
//
// Every case here is a bug that actually reached production and cost real
// proof photos. If one of these ever fails again, a driver's day is on the
// line, so they're worth the ceremony.

import { beforeEach, describe, expect, it, vi } from "vitest";

// The queue imports server actions; stub them so importing it in Node works.
vi.mock("@/lib/actions/stops", () => ({
  updateStopStatus: vi.fn(async () => ({})),
  confirmDropoff: vi.fn(async () => ({})),
  confirmPickup: vi.fn(async () => ({})),
  setPickupNone: vi.fn(async () => ({})),
  setDropoffNone: vi.fn(async () => ({})),
  flagStop: vi.fn(async () => ({})),
}));
vi.mock("@/lib/actions/prospectVisits", () => ({
  completeProspectVisit: vi.fn(async () => ({})),
  skipProspectVisit: vi.fn(async () => ({})),
}));
vi.mock("@/lib/compressImage", () => ({
  // Shrink deterministically so the 413 path is testable.
  compressImage: vi.fn(async (f: File) => new File([new Uint8Array(10)], f.name, { type: "image/jpeg" })),
}));

import { enqueuePhoto, flush } from "@/lib/offline";

const photo = (bytes = 1000) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

interface StoredPhoto {
  id: string;
  stopId: string;
  blob: Blob;
  dead?: boolean;
  attempts?: number;
  nextAttemptAt?: number;
}

/** Open the queue's store directly. The module keeps its own connection open,
 *  so deleteDatabase() would block - clear the contents instead. */
function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("sw-offline", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("photos")) {
        req.result.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function resetDb() {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  localStorage.clear();
}

/** Read the queue directly: deterministic, and doesn't trigger another flush
 *  the way subscribing would. */
async function readQueue(): Promise<StoredPhoto[]> {
  const db = await openQueue();
  const rows = await new Promise<StoredPhoto[]>((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const req = tx.objectStore("photos").getAll();
    req.onsuccess = () => resolve(req.result as StoredPhoto[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}

/** Put a photo straight into the queue.
 *
 *  enqueuePhoto() fires its own background flush, which races an explicit
 *  flush() and makes multi-photo assertions non-deterministic. Seeding lets a
 *  test exercise exactly one pass of the flush loop. */
async function seed(stopId: string, blob: Blob) {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put({
      id: `${stopId}-seed`,
      stopId,
      blob,
      type: "image/jpeg",
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const live = (rows: StoredPhoto[]) => rows.filter((p) => !p.dead);
const dead = (rows: StoredPhoto[]) => rows.filter((p) => p.dead);

const settle = () => new Promise((r) => setTimeout(r, 60));

describe("photo upload queue", () => {
  beforeEach(async () => {
    await resetDb();
    vi.restoreAllMocks();
    (navigator as unknown as { onLine: boolean }).onLine = true;
  });

  it("uploads a queued photo and removes it from the queue", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: "u" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueuePhoto("stop-1", photo(), "dropoff");
    await flush();
    await settle();

    expect(fetchMock).toHaveBeenCalled();
    expect(await readQueue()).toHaveLength(0);
  });

  // The original bug: flush() broke out of the loop on the first failure, so
  // one bad photo froze every photo queued behind it.
  it("a failing photo does not block the ones behind it", async () => {
    const hit: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const stopId = (init.body as FormData).get("stopId") as string;
        hit.push(stopId);
        // stop-1 always fails with a server error; stop-2 succeeds.
        return stopId === "stop-1"
          ? new Response("boom", { status: 500 })
          : new Response(JSON.stringify({ url: "u" }), { status: 200 });
      })
    );

    await seed("stop-1", photo());
    await seed("stop-2", photo());
    await flush();
    await settle();

    expect(hit).toContain("stop-1");
    expect(hit).toContain("stop-2"); // would be missing under head-of-line blocking
  });

  // The bug I introduced: /api/photo returned 400 for oversized uploads, and
  // 400 means "drop it", so proof photos were deleted outright.
  it("keeps the photo when the server rejects it as too large (413)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("too big", { status: 413 })));

    await enqueuePhoto("stop-1", photo(5000));
    await flush();
    await settle();

    const rows = await readQueue();
    expect(live(rows)).toHaveLength(1); // shrunk and requeued, never dropped
    expect(dead(rows)).toHaveLength(0);
  });

  it("drops a photo only when the stop is genuinely gone (400)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no stop", { status: 400 })));

    await enqueuePhoto("stop-gone", photo());
    await flush();
    await settle();

    expect(await readQueue()).toHaveLength(0);
  });

  // 13,268 requests over two days came from retrying every 20s with no backoff.
  it("backs off instead of retrying a failing photo immediately", async () => {
    const fetchMock = vi.fn(async () => new Response("err", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueuePhoto("stop-1", photo());
    await flush();
    await settle();
    const afterFirst = fetchMock.mock.calls.length;

    await flush(); // immediately again
    await settle();

    expect(fetchMock.mock.calls.length).toBe(afterFirst); // still backing off
  });

  // iOS can purge the bytes behind an IndexedDB Blob. Retrying can never work,
  // and sending it is what produced "no boundary found in multipart body".
  it("marks a photo whose data was cleared as failed, and stops retrying it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await enqueuePhoto("stop-1", photo(0)); // zero-byte blob
    await flush();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled(); // never sent
    const rows = await readQueue();
    expect(dead(rows)).toHaveLength(1);
    expect(live(rows)).toHaveLength(0); // not counted as "still uploading"
  });

  // A dead zone must not look like a permanent failure.
  it("keeps the photo queued when the request never reaches the server", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));

    await enqueuePhoto("stop-1", photo());
    await flush();
    await settle();

    const rows = await readQueue();
    expect(live(rows)).toHaveLength(1);
    expect(dead(rows)).toHaveLength(0);
  });

  it("does not attempt uploads while offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    (navigator as unknown as { onLine: boolean }).onLine = false;

    await enqueuePhoto("stop-1", photo());
    await flush();
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
