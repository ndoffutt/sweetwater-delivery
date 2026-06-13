"use client";

import PinPad from "@/components/PinPad";

export default function LoginScreen() {
  return (
    <div className="bg-cream rounded-2xl p-8 shadow-xl w-full max-w-sm">
      <p className="text-center font-body text-sm text-charcoal/60 mb-6">
        Enter your PIN
      </p>
      <PinPad />
    </div>
  );
}
