"use client";

import { useEffect, useState } from "react";

/**
 * Brief "Welcome back" toast shown once per app open. Uses sessionStorage so it
 * fires when the (persisted) session auto-resumes - i.e. each time the installed
 * PWA is cold-started - but not on every in-app navigation or refresh.
 */
export default function WelcomeBack({ name }: { name: string }) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      if (sessionStorage.getItem("sw-greeted")) return;
      sessionStorage.setItem("sw-greeted", "1");
    } catch {
      // sessionStorage can throw in private mode - just skip the greeting.
      return;
    }
    const first = (name || "").trim().split(/\s+/)[0] || "there";
    setText(`Welcome back, ${first}`);
    setShow(true);
    const hide = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(hide);
  }, [name]);

  if (!text) return null;

  return (
    // Top-center on mobile (over the map, covers nothing); bottom-center on
    // desktop so it never sits on top of the page title.
    <div
      aria-live="polite"
      className="fixed inset-x-0 top-[env(safe-area-inset-top,0px)] md:top-auto md:bottom-6 z-[200] flex justify-center pointer-events-none"
    >
      <div
        className="mt-3.5 md:mt-0"
        style={{
          transform: show ? "translateY(0)" : "translateY(-160%)",
          opacity: show ? 1 : 0,
          transition:
            "transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s ease",
          background: "#02733e",
          color: "#FAF7F2",
          borderRadius: 999,
          padding: "10px 20px",
          fontFamily: '"Jost", system-ui, sans-serif',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.01em",
          boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
