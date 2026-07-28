"use client";

import { useState } from "react";
import { testBouncieCode, type BouncieTestResult } from "@/lib/actions/bouncie";

const AUTHORIZE_URL =
  "https://auth.bouncie.com/dialog/authorize?response_type=code&client_id=sweetwater-delivery&redirect_uri=https://sweetwater-delivery.vercel.app";

export default function BouncieSetup() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<BouncieTestResult | null>(null);

  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await testBouncieCode(code));
    } catch {
      setRes({ ok: false, message: "Something went wrong running the test." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 md:p-8 md:max-w-2xl md:mx-auto space-y-5">
      <div>
        <h2 className="font-serif text-2xl font-light text-charcoal">Van GPS setup</h2>
        <p className="text-xs text-charcoal/40 font-body uppercase tracking-widest mt-1">
          Connect Bouncie
        </p>
      </div>

      <ol className="space-y-3 text-sm font-body text-charcoal/70">
        <li className="flex gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-green-primary text-cream text-[11px] flex items-center justify-center">1</span>
          <span>
            <a href={AUTHORIZE_URL} target="_blank" rel="noopener noreferrer" className="text-green-primary underline underline-offset-2">
              Open the Bouncie approval page
            </a>{" "}
            and approve the van.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-green-primary text-cream text-[11px] flex items-center justify-center">2</span>
          <span>
            It sends you back here. Look at your browser&apos;s address bar — it ends in
            <code className="mx-1 px-1 py-0.5 rounded bg-cream-dark text-charcoal text-[12px]">?code=XXXX</code>.
            Copy just the part after <b>code=</b>.
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="shrink-0 w-5 h-5 rounded-full bg-green-primary text-cream text-[11px] flex items-center justify-center">3</span>
          <span>Paste it below and test it right away — these codes go stale quickly.</span>
        </li>
      </ol>

      <div className="bg-cream rounded-xl border border-cream-dark p-4 space-y-3">
        <label className="block text-xs text-charcoal/40 font-body uppercase tracking-widest">
          Authorization code
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="paste the code here"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-cream-dark/60 rounded-lg px-3 py-3 font-mono text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-green-primary/40"
        />
        <button
          onClick={run}
          disabled={busy || !code.trim()}
          className="w-full min-h-tap bg-green-primary text-cream font-body text-xs uppercase tracking-widest py-3 rounded-lg disabled:opacity-50"
        >
          {busy ? "Testing…" : "Test this code"}
        </button>
        <p className="text-[11px] text-charcoal/35 font-body">
          The code is used for this one test and never saved or logged.
        </p>
      </div>

      {res && (
        <div className={`rounded-xl border p-4 ${res.ok ? "bg-green-primary/5 border-green-primary/30" : "bg-gold-primary/10 border-gold-primary/40"}`}>
          <p className={`font-body text-sm ${res.ok ? "text-green-primary" : "text-gold-dark"}`}>
            {res.ok ? "✓ " : "⚠ "}{res.message}
          </p>
          {res.vehicles && res.vehicles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {res.vehicles.map((v, i) => (
                <div key={i} className="text-[12px] font-body text-charcoal/70">
                  🚐 <b>{v.nickName ?? "Van"}</b>
                  {v.hasLocation ? ` · ${v.address ?? "location reporting"}` : " · no location yet"}
                  {v.lastUpdated ? ` · ${new Date(v.lastUpdated).toLocaleString()}` : ""}
                </div>
              ))}
            </div>
          )}
          {res.ok && (
            <p className="text-[11px] text-charcoal/50 font-body mt-3">
              Now save this same code as <b>BOUNCIE_CODE</b> in Vercel (Production) and redeploy —
              then the van shows up on the Live map.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
