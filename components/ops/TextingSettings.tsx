"use client";

// Settings → Texting. The master switch and the dry-run redirect live here
// rather than in Vercel env vars, because killing a misfiring customer text
// should take five seconds on a phone, not an env edit plus a redeploy.
//
// The message list below is rendered from lib/autoTexts.ts — the same source
// the sender uses — so this page can never describe a message we stopped
// sending.
import { useState, useTransition } from "react";
import { setAutoTextsOn, setAutoTextsTestTo } from "@/lib/actions/settings";
import { AUTO_TEXTS } from "@/lib/autoTexts";
import { Kicker, btnPrimary, inputCls } from "@/components/ops/Bits";

export default function TextingSettings({
  autoTextsOn: initialOn,
  testTo: initialTestTo,
  smsConfigured,
}: {
  autoTextsOn: boolean;
  testTo: string;
  smsConfigured: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [testTo, setTestTo] = useState(initialTestTo);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setErr("");
    start(async () => {
      const r = await setAutoTextsOn(next);
      if (r?.error) { setOn(!next); setErr(r.error); return; }
      setSaved(next ? "Automated texts are ON" : "Automated texts are OFF");
      setTimeout(() => setSaved(""), 2500);
    });
  }

  function saveTestTo() {
    setErr("");
    start(async () => {
      const r = await setAutoTextsTestTo(testTo);
      if (r?.error) { setErr(r.error); return; }
      setSaved(testTo.trim() ? "Test mode on — texts go to you" : "Test mode off — texts go to customers");
      setTimeout(() => setSaved(""), 2500);
    });
  }

  const testing = initialTestTo.trim().length > 0;

  return (
    <div className="space-y-5">
      {err && <p className="text-[13px] text-ops-danger">{err}</p>}
      {saved && <p className="text-[13px] text-ops-accent">{saved}</p>}

      {/* Live state, stated plainly — this is the thing you check at a glance */}
      <div className="border border-ops-divider p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-barlow text-[15px]">Automated texts</p>
            <p className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-0.5">
              {!smsConfigured
                ? "Texting isn't configured — nothing can send."
                : !on
                ? "Off. Nothing automated will send."
                : testing
                ? `On, but in test mode — everything goes to ${initialTestTo}.`
                : "On. Real customers will be texted."}
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={pending}
            aria-pressed={on}
            className={`shrink-0 min-h-tap w-12 h-7 rounded-full transition-colors relative ${on ? "bg-ops-accent" : "bg-[rgba(26,26,26,.2)]"}`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-ops-bg transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {/* Dry run */}
      <div className="border border-ops-divider p-4">
        <p className="font-barlow text-[15px]">Test mode</p>
        <p className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-0.5 mb-3">
          Put your own number here and every automated text goes to you instead of the
          customer, labelled with who it would have gone to. Clear it to go live.
        </p>
        <div className="flex gap-2">
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="(631) 555-0123"
            className={`${inputCls} flex-1`}
          />
          <button className={btnPrimary} disabled={pending} onClick={saveTestTo}>Save</button>
        </div>
        {testing && (
          <p className="font-barlow text-[12.5px] text-ops-gold-deep mt-2">
            Test mode is on — no customer is receiving automated texts.
          </p>
        )}
      </div>

      {/* Exactly what sends, and when */}
      <div>
        <Kicker>The automated texts</Kicker>
        <p className="font-barlow text-[12.5px] text-[rgba(26,26,26,.55)] mt-1 mb-3">
          These are the only messages the app sends on its own. Anything else is
          someone typing it in Messages.
        </p>
        <div className="space-y-3">
          {AUTO_TEXTS.map((t) => (
            <div key={t.id} className="border border-ops-divider p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="font-barlowc font-semibold uppercase tracking-[0.06em] text-[13px]">{t.title}</p>
                <span className="font-barlow text-[12px] text-[rgba(26,26,26,.5)]">{t.appliesTo}</span>
              </div>
              <p className="font-barlow text-[15px] mt-2.5 border-l-2 border-ops-accent pl-3">
                &ldquo;{t.body}&rdquo;
              </p>
              <dl className="mt-3 space-y-1.5">
                <div className="flex gap-2">
                  <dt className="font-barlowc uppercase tracking-[0.06em] text-[11px] text-[rgba(26,26,26,.45)] w-[54px] shrink-0 pt-0.5">When</dt>
                  <dd className="font-barlow text-[13px] text-[rgba(26,26,26,.7)] flex-1">{t.when}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-barlowc uppercase tracking-[0.06em] text-[11px] text-[rgba(26,26,26,.45)] w-[54px] shrink-0 pt-0.5">Who</dt>
                  <dd className="font-barlow text-[13px] text-[rgba(26,26,26,.7)] flex-1">{t.who}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
