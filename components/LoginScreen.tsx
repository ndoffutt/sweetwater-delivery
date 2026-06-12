"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginDriver } from "@/lib/actions/auth";
import PinPad from "@/components/PinPad";

export default function LoginScreen() {
  const [mode, setMode] = useState<"choose" | "manager">("choose");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDriver() {
    setError("");
    startTransition(async () => {
      const result = await loginDriver();
      if (result.error) {
        setError(result.error);
      } else if (result.redirect) {
        router.push(result.redirect);
      }
    });
  }

  if (mode === "manager") {
    return (
      <div className="bg-cream rounded-2xl p-8 shadow-xl w-full max-w-sm">
        <p className="text-center font-body text-sm text-charcoal/60 mb-6">
          Enter your PIN
        </p>
        <PinPad />
        <button
          onClick={() => setMode("choose")}
          className="block mx-auto mt-6 text-xs text-charcoal/40 font-body uppercase tracking-widest"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="bg-cream rounded-2xl p-8 shadow-xl w-full max-w-sm">
      <button
        onClick={handleDriver}
        disabled={isPending}
        className="w-full min-h-tap bg-green-primary text-cream font-body text-sm uppercase tracking-widest py-5 rounded-xl disabled:opacity-60"
      >
        {isPending ? "Starting…" : "Start Driving"}
      </button>

      {error && (
        <p className="text-center text-sm text-red-600 mt-4 font-body">
          {error}
        </p>
      )}

      <button
        onClick={() => {
          setError("");
          setMode("manager");
        }}
        className="block mx-auto mt-6 text-xs text-charcoal/40 font-body uppercase tracking-widest"
      >
        Staff Login →
      </button>
    </div>
  );
}
