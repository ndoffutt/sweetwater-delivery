"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginManager } from "@/lib/actions/auth";

export default function PinPad() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDigit(d: string) {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError("");

    if (next.length >= 4) {
      startTransition(async () => {
        const result = await loginManager(next);
        if (result.error) {
          setError(result.error);
          setPin("");
        } else if (result.redirect) {
          router.push(result.redirect);
        }
      });
    }
  }

  function handleDelete() {
    setPin((p) => p.slice(0, -1));
    setError("");
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="w-full max-w-xs mx-auto">
      {/* PIN dots */}
      <div className="flex justify-center gap-3 mb-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              i < pin.length
                ? "bg-green-primary border-green-primary scale-110"
                : "border-charcoal/30"
            }`}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <p className="text-center text-sm text-red-600 mb-4 font-body">
          {error}
        </p>
      )}

      {/* Loading */}
      {isPending && (
        <p className="text-center text-sm text-charcoal/50 mb-4 font-body">
          Verifying...
        </p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) => {
          if (k === "")
            return <div key={i} />;

          if (k === "del") {
            return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={isPending}
                className="min-h-tap flex items-center justify-center rounded-xl text-charcoal/60 active:bg-cream-dark transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l7-7 12 0 0 14-12 0z"
                  />
                </svg>
              </button>
            );
          }

          return (
            <button
              key={i}
              onClick={() => handleDigit(k)}
              disabled={isPending}
              className="min-h-tap h-16 flex items-center justify-center rounded-xl bg-cream-dark text-charcoal text-2xl font-body font-medium active:bg-green-primary active:text-cream transition-colors"
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
