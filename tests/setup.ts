// Shared test environment.
//
// lib/offline.ts is a browser module: it reaches for indexedDB, localStorage,
// navigator and document at import time. Provide just enough of each that the
// queue logic can be exercised in Node.

import "fake-indexeddb/auto";
import { vi } from "vitest";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: { onLine: true, storage: { persist: vi.fn(), persisted: vi.fn(async () => true) } },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "document", {
  value: { addEventListener: vi.fn(), visibilityState: "visible" },
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, "window", {
  value: { addEventListener: vi.fn() },
  writable: true,
  configurable: true,
});

// enqueuePhoto returns a local preview URL; Node has no object-URL support.
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:test";
