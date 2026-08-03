// Regression tests for the stop-action queue.
//
// A driver marking a stop complete in a dead zone must never lose that intent.
// The dangerous case is a request that neither succeeds nor rejects - the radio
// is attached to a tower and the call just hangs - which is what the timeout
// and the queue-first ordering exist for.

import { beforeEach, describe, expect, it, vi } from "vitest";

const updateStopStatus = vi.fn(async () => ({}) as { error?: string });
const confirmDropoff = vi.fn(async () => ({}) as { error?: string });
const reopenStop = vi.fn(async () => ({}) as { error?: string });

vi.mock("@/lib/actions/stops", () => ({
  updateStopStatus: (...a: unknown[]) => updateStopStatus(...(a as [])),
  confirmDropoff: (...a: unknown[]) => confirmDropoff(...(a as [])),
  confirmPickup: vi.fn(async () => ({})),
  setPickupNone: vi.fn(async () => ({})),
  setDropoffNone: vi.fn(async () => ({})),
  flagStop: vi.fn(async () => ({})),
  reopenStop: (...a: unknown[]) => reopenStop(...(a as [])),
}));
vi.mock("@/lib/actions/prospectVisits", () => ({
  completeProspectVisit: vi.fn(async () => ({})),
  skipProspectVisit: vi.fn(async () => ({})),
}));
vi.mock("@/lib/compressImage", () => ({ compressImage: vi.fn(async (f: File) => f) }));

import { runStopAction, flush } from "@/lib/offline";

const QUEUE_KEY = "sw-action-queue";
const queue = () => JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as { kind: string; stopId: string }[];
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("stop action queue", () => {
  beforeEach(() => {
    localStorage.clear();
    updateStopStatus.mockReset().mockResolvedValue({});
    confirmDropoff.mockReset().mockResolvedValue({});
    reopenStop.mockReset().mockResolvedValue({});
    (navigator as unknown as { onLine: boolean }).onLine = true;
  });

  it("sends immediately and leaves nothing queued when the server answers", async () => {
    await runStopAction({ kind: "status", stopId: "s1", status: "completed" });
    expect(updateStopStatus).toHaveBeenCalledWith("s1", "completed");
    expect(queue()).toHaveLength(0);
  });

  // The bug this ordering fixes: the old code sent first and queued only in a
  // catch, so a request that hung was never queued at all and the work vanished.
  it("keeps the action queued when the request hangs", async () => {
    // Timers must be faked before the call, so the deadline inside
    // withTimeout() is the one we can advance.
    vi.useFakeTimers();
    updateStopStatus.mockImplementation(() => new Promise(() => {})); // never settles

    const run = runStopAction({ kind: "status", stopId: "s1", status: "completed" });
    // Queued synchronously, before the send is even attempted.
    expect(queue()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9000); // past ACTION_TIMEOUT_MS
    await run;
    vi.useRealTimers();

    expect(queue()).toHaveLength(1); // survived the hang
    expect(queue()[0].stopId).toBe("s1");
  });

  it("keeps the action queued when the server rejects it", async () => {
    updateStopStatus.mockRejectedValue(new Error("offline"));
    await runStopAction({ kind: "status", stopId: "s1", status: "completed" });
    expect(queue()).toHaveLength(1);
  });

  // Toggling a confirmation on and off while offline must not pile up writes.
  it("compacts repeated actions of the same kind for the same stop", async () => {
    confirmDropoff.mockRejectedValue(new Error("offline"));

    await runStopAction({ kind: "dropoff", stopId: "s1", confirmed: true });
    await runStopAction({ kind: "dropoff", stopId: "s1", confirmed: false });
    await runStopAction({ kind: "dropoff", stopId: "s1", confirmed: true });

    expect(queue()).toHaveLength(1); // last write wins
  });

  it("keeps actions for different stops separate", async () => {
    updateStopStatus.mockRejectedValue(new Error("offline"));
    await runStopAction({ kind: "status", stopId: "s1", status: "completed" });
    await runStopAction({ kind: "status", stopId: "s2", status: "completed" });
    expect(queue()).toHaveLength(2);
  });

  it("replays queued actions on the next flush and clears them", async () => {
    updateStopStatus.mockRejectedValue(new Error("offline"));
    await runStopAction({ kind: "status", stopId: "s1", status: "completed" });
    expect(queue()).toHaveLength(1);

    updateStopStatus.mockReset().mockResolvedValue({});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await flush();
    await settle();

    expect(queue()).toHaveLength(0);
  });

  // Reopening a finished stop must go through its own action. Routing it via
  // updateStopStatus("arrived") would re-run the first-arrival side effects and
  // text the customer "on the way" a second time.
  it("reopening a stop uses reopenStop, never a status change", async () => {
    await runStopAction({ kind: "reopen", stopId: "s1" });
    expect(reopenStop).toHaveBeenCalledWith("s1");
    expect(updateStopStatus).not.toHaveBeenCalled();
    expect(queue()).toHaveLength(0);
  });

  it("keeps a reopen queued when the driver is offline", async () => {
    reopenStop.mockRejectedValue(new Error("offline"));
    await runStopAction({ kind: "reopen", stopId: "s1" });
    expect(queue()).toHaveLength(1);
    expect(queue()[0].kind).toBe("reopen");
  });

  // A stop deleted by dispatch is permanently gone: retrying forever is wrong.
  it("does not requeue an action the server calls permanently invalid", async () => {
    updateStopStatus.mockResolvedValue({ error: "no rows returned" });
    await runStopAction({ kind: "status", stopId: "gone", status: "completed" });
    expect(queue()).toHaveLength(0);
  });
});
