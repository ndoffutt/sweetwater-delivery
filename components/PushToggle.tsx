"use client";

import { useEffect, useState } from "react";
import { savePushSubscription, deletePushSubscription } from "@/lib/actions/push";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "busy";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID) {
        if (live) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (live) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (live) setState(sub ? "on" : "off");
    })();
    return () => { live = false; };
  }, []);

  async function enable() {
    setError("");
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID!) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePushSubscription(
        { endpoint: json.endpoint, keys: json.keys },
        navigator.userAgent
      );
      if (res.error) { await sub.unsubscribe().catch(() => {}); setError(res.error); setState("off"); return; }
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't enable notifications");
      setState("off");
    }
  }

  async function disable() {
    setError("");
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  return (
    <div className="bg-cream rounded-xl border border-cream-dark p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-body font-medium text-charcoal">Visit reminders</p>
          <p className="text-xs text-charcoal/50 font-body mt-0.5">
            A daily 8am push when prospects are overdue for a visit.
          </p>
        </div>
        {state === "on" ? (
          <button onClick={disable} className="shrink-0 min-h-tap px-3 py-1.5 rounded-lg border border-cream-dark bg-cream text-charcoal/60 text-xs font-body uppercase tracking-widest">
            On — turn off
          </button>
        ) : state === "off" ? (
          <button onClick={enable} className="shrink-0 min-h-tap px-3 py-1.5 rounded-lg bg-green-primary text-cream text-xs font-body uppercase tracking-widest">
            Enable
          </button>
        ) : state === "busy" || state === "loading" ? (
          <span className="shrink-0 text-xs text-charcoal/40 font-body">…</span>
        ) : null}
      </div>
      {state === "denied" && (
        <p className="text-xs text-charcoal/50 font-body mt-2">
          Notifications are blocked in your browser/phone settings — enable them for this site, then reload.
        </p>
      )}
      {state === "unsupported" && (
        <p className="text-xs text-charcoal/50 font-body mt-2">
          This device can&apos;t receive push here. On iPhone, add the app to your Home Screen first, then enable.
        </p>
      )}
      {error && <p className="text-xs text-red-600 font-body mt-2">{error}</p>}
    </div>
  );
}
