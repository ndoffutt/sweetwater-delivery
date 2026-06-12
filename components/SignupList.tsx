"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSignupAsCustomer, dismissSignup } from "@/lib/actions/signups";

export interface Signup {
  id: string;
  full_name: string;
  address: string;
  phone: string | null;
  email: string | null;
  start_date: string | null;
  notes: string | null;
  created_at: string;
}

export default function SignupList({ signups: initial }: { signups: Signup[] }) {
  const [signups, setSignups] = useState(initial);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleAdd(id: string) {
    setError("");
    setSignups((s) => s.filter((x) => x.id !== id));
    startTransition(async () => {
      const result = await addSignupAsCustomer(id);
      if (result.error) {
        setError(result.error);
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  function handleDismiss(id: string) {
    setError("");
    setSignups((s) => s.filter((x) => x.id !== id));
    startTransition(async () => {
      await dismissSignup(id);
      router.refresh();
    });
  }

  if (signups.length === 0) {
    return (
      <p className="text-center text-charcoal/40 font-body py-12">
        No new signups right now.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-center text-sm text-red-600 font-body">{error}</p>
      )}
      {signups.map((s) => (
        <div
          key={s.id}
          className="bg-cream rounded-xl p-4 border border-cream-dark"
        >
          <p className="font-body font-medium text-charcoal">{s.full_name}</p>
          <p className="text-xs text-charcoal/50 font-body">{s.address}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
            {s.phone && (
              <span className="text-xs text-charcoal/50 font-body">
                📞 {s.phone}
              </span>
            )}
            {s.email && (
              <span className="text-xs text-charcoal/50 font-body">
                ✉️ {s.email}
              </span>
            )}
            {s.start_date && (
              <span className="text-xs text-gold-dark font-body">
                Start: {s.start_date}
              </span>
            )}
          </div>
          {s.notes && (
            <p className="text-xs text-green-primary font-body mt-2">
              📝 {s.notes}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleAdd(s.id)}
              disabled={isPending}
              className="flex-1 min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-60"
            >
              + Add as Customer
            </button>
            <button
              onClick={() => handleDismiss(s.id)}
              disabled={isPending}
              className="min-h-tap px-4 text-charcoal/40 font-body text-xs uppercase tracking-widest"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
