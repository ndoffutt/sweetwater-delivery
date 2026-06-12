"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendThreadMessage, markThreadRead, callFromOfficeLine } from "@/lib/actions/messages";

interface Thread {
  phone: string;
  digits: string;
  customerName: string | null;
  customerId: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
}

interface Msg {
  id: string;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  sender_name: string | null;
  status: string;
  created_at: string;
}

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// Shared business-number inbox: every signed-in device (manager, office,
// driver) sees the same threads and replies from the one office number.
export default function MessagesView({ canCall }: { canCall: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [setup, setSetup] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [sel, setSel] = useState<string | null>(null); // selected thread digits
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newTo, setNewTo] = useState("");
  const [composing, setComposing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = sel;

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      const data = await res.json();
      if (data.setup) setSetup(true);
      setThreads(data.threads ?? []);
      setConfigured(data.configured ?? false);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  const loadThread = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/messages?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const data = await res.json();
      setMsgs(data.messages ?? []);
    } catch {
      /* offline */
    }
  }, []);

  // Poll: threads always; the open conversation too.
  useEffect(() => {
    loadThreads();
    const t = setInterval(() => {
      loadThreads();
      const cur = selRef.current;
      if (cur) {
        const th = threads.find((x) => x.digits === cur);
        if (th) loadThread(th.phone);
      }
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const current = threads.find((t) => t.digits === sel) ?? null;

  async function openThread(t: Thread) {
    setSel(t.digits);
    setComposing(false);
    setError("");
    await loadThread(t.phone);
    if (t.unread > 0) {
      setThreads((cur) => cur.map((x) => (x.digits === t.digits ? { ...x, unread: 0 } : x)));
      markThreadRead(t.phone);
    }
  }

  async function send() {
    const to = current?.phone ?? newTo;
    const text = draft.trim();
    if (!to || !text || busy) return;
    setBusy(true);
    setError("");
    // Optimistic append.
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      direction: "outbound",
      phone: to,
      body: text,
      sender_name: "You",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setMsgs((m) => [...m, optimistic]);
    setDraft("");
    const res = await sendThreadMessage(to, text);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setMsgs((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(text);
      return;
    }
    if (composing) {
      setComposing(false);
      await loadThreads();
      setSel(to.replace(/\D/g, "").slice(-10));
    }
    loadThread(to);
  }

  async function call() {
    if (!current) return;
    setError("");
    const res = await callFromOfficeLine(current.phone);
    if (res.error) setError(res.error);
    else setError("Calling your phone now - answer to connect.");
  }

  const showConvo = sel !== null || composing;

  return (
    <div className="md:flex md:h-screen">
      {/* Thread list */}
      <div className={`${showConvo ? "hidden md:flex" : "flex"} md:w-96 md:border-r md:border-cream-dark flex-col`}>
        <div className="p-4 border-b border-cream-dark flex items-center justify-between">
          <div>
            <h2 className="font-serif text-2xl font-light text-charcoal leading-none">Messages</h2>
            <p className="text-[11px] text-charcoal/40 font-body uppercase tracking-widest mt-1">
              {configured ? "Office number" : "Not connected yet"}
            </p>
          </div>
          <button
            onClick={() => { setComposing(true); setSel(null); setMsgs([]); setNewTo(""); setError(""); }}
            className="min-h-tap px-3 py-1.5 bg-green-primary text-cream rounded-lg text-xs font-body uppercase tracking-widest"
          >
            + New
          </button>
        </div>

        {(setup || !configured) && (
          <div className="m-3 rounded-xl border border-gold-primary/40 bg-gold-primary/10 p-3">
            <p className="text-xs font-body text-charcoal leading-relaxed">
              {setup
                ? "Run supabase/messaging.sql in the Supabase SQL editor to turn on the inbox."
                : "Texting goes live once the Twilio credentials are added. Until then, outgoing messages are saved as pending."}
            </p>
          </div>
        )}

        <div className="md:flex-1 md:overflow-auto p-3 space-y-1.5">
          {threads.map((t) => (
            <button
              key={t.digits}
              onClick={() => openThread(t)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border ${sel === t.digits ? "bg-green-primary/5 border-green-primary/30" : "bg-cream border-cream-dark"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-body font-medium text-charcoal truncate">
                    {t.customerName ?? fmtPhone(t.phone)}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-charcoal/40 font-body">{fmtTime(t.lastAt)}</span>
                </div>
                <p className="text-xs text-charcoal/45 font-body truncate mt-0.5">
                  {t.lastDirection === "outbound" ? "You: " : ""}{t.lastBody}
                </p>
              </div>
              {t.unread > 0 && (
                <span className="shrink-0 w-5 h-5 rounded-full bg-gold-primary text-charcoal text-[11px] font-body font-semibold flex items-center justify-center">
                  {t.unread}
                </span>
              )}
            </button>
          ))}
          {threads.length === 0 && !setup && (
            <p className="text-center text-charcoal/40 font-body py-10 text-sm px-6">
              No conversations yet. Texts to the office number will appear here.
            </p>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className={`${showConvo ? "flex" : "hidden md:flex"} flex-1 flex-col md:h-screen`}>
        {current || composing ? (
          <>
            <div className="p-4 border-b border-cream-dark flex items-center gap-3">
              <button onClick={() => { setSel(null); setComposing(false); }} className="md:hidden text-sm text-charcoal/50 font-body">←</button>
              {composing ? (
                <input
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="Phone number…"
                  inputMode="tel"
                  className="flex-1 p-2 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-xl font-light text-charcoal truncate">
                    {current!.customerName ?? fmtPhone(current!.phone)}
                  </div>
                  <div className="text-[11px] text-charcoal/40 font-body">{fmtPhone(current!.phone)}</div>
                </div>
              )}
              {canCall && current && (
                <button onClick={call} className="min-h-tap px-3 py-1.5 border border-cream-dark text-green-primary rounded-lg text-xs font-body uppercase tracking-widest">
                  Call
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-2 bg-cream-dark/20">
              {msgs.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${m.direction === "outbound" ? "bg-green-primary text-cream rounded-br-md" : "bg-cream border border-cream-dark text-charcoal rounded-bl-md"}`}>
                    <p className="font-body text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] font-body mt-1 ${m.direction === "outbound" ? "text-cream/60" : "text-charcoal/35"}`}>
                      {m.direction === "outbound" && m.sender_name ? `${m.sender_name} · ` : ""}
                      {fmtTime(m.created_at)}
                      {m.direction === "outbound" && m.status === "pending" ? " · pending" : ""}
                      {m.direction === "outbound" && m.status === "failed" ? " · failed" : ""}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && <p className="px-4 py-1.5 text-xs font-body text-gold-dark">{error}</p>}

            <div className="p-3 border-t border-cream-dark flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                placeholder="Text from the office number…"
                className="flex-1 p-3 rounded-xl border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
              />
              <button
                onClick={send}
                disabled={busy || !draft.trim() || (composing && !newTo.trim())}
                className="min-h-tap px-5 py-3 bg-green-primary text-cream rounded-xl text-xs font-body uppercase tracking-widest disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="hidden md:flex h-full items-center justify-center text-charcoal/30 font-body">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
