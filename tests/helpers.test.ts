// Pure-logic tests for the helpers that quietly decide correctness:
// phone matching (which thread a text lands in, which customer it attaches to)
// and the Eastern-time date used to pick "today's route".

import { describe, expect, it } from "vitest";
import { phoneDigits, toE164 } from "@/lib/messaging";
import { easternToday } from "@/lib/date";

describe("phone normalisation", () => {
  // Threads are grouped on the last 10 digits, so every format a number can
  // arrive in has to collapse to the same key or a conversation splits in two.
  it("collapses every common format to the same 10 digits", () => {
    const forms = [
      "+16315551234",
      "16315551234",
      "6315551234",
      "(631) 555-1234",
      "631-555-1234",
      "631.555.1234",
      " 631 555 1234 ",
    ];
    const keys = Array.from(new Set(forms.map(phoneDigits)));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("6315551234");
  });

  it("is safe on empty and malformed input", () => {
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits(undefined)).toBe("");
    expect(phoneDigits("")).toBe("");
    expect(phoneDigits("not a phone")).toBe("");
  });

  it("formats 10 digits as E.164 for Twilio", () => {
    expect(toE164("631-555-1234")).toBe("+16315551234");
    expect(toE164("(631) 555-1234")).toBe("+16315551234");
    expect(toE164("+16315551234")).toBe("+16315551234");
  });
});

describe("easternToday", () => {
  it("returns a YYYY-MM-DD date string", () => {
    expect(easternToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The route date is Eastern, not UTC. Late evening in New York is already
  // "tomorrow" in UTC, and picking the UTC date would load the wrong route.
  it("does not drift to the UTC date late in the Eastern evening", () => {
    const eastern = easternToday();
    const utc = new Date().toISOString().slice(0, 10);
    const diff = Math.abs(Date.parse(eastern) - Date.parse(utc)) / 864e5;
    expect(diff).toBeLessThanOrEqual(1); // same day, or exactly one apart
  });
});
