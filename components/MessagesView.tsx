"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  sendThreadMessage,
  markThreadRead,
  markThreadUnread,
  callFromOfficeLine,
  reactToMessage,
  saveContact,
  setThreadPinned,
  setThreadArchived,
} from "@/lib/actions/messages";

// Shared business-number inbox, styled after iMessage: one thread per number,
// bubbles grouped by sender, day separators, quote replies and tapbacks.
// Every signed-in device (manager, office, driver) sees the same conversations
// and replies from the one office number.

interface Thread {
  phone: string;
  digits: string;
  name: string | null;
  nameSource: "customer" | "prospect" | "contact" | null;
  customerId: string | null;
  lastBody: string;
  lastAt: string;
  lastDirection: "inbound" | "outbound";
  unread: number;
  pinned: boolean;
  archived: boolean;
}

interface Msg {
  id: string;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  sender_name: string | null;
  status: string;
  created_at: string;
  reply_to_id?: string | null;
  reaction?: string | null;
  media_urls?: string[] | null;
}

interface Contact {
  digits: string;
  name: string;
  source: "customer" | "prospect" | "contact";
  customerId: string | null;
}

const TAPBACKS: { key: string; glyph: string; label: string }[] = [
  { key: "love", glyph: "❤️", label: "Love" },
  { key: "like", glyph: "👍", label: "Like" },
  { key: "dislike", glyph: "👎", label: "Dislike" },
  { key: "laugh", glyph: "😂", label: "Haha" },
  { key: "emphasize", glyph: "‼️", label: "Emphasize" },
  { key: "question", glyph: "❓", label: "Question" },
];
const glyphFor = (k: string | null | undefined) =>
  TAPBACKS.find((t) => t.key === k)?.glyph ?? null;

const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Short stamp for the conversation list: time today, "Yesterday", else date. */
const listStamp = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(iso);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (now.getTime() - d.getTime() < 7 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
};

/** Full separator line between days, the way iMessage breaks up a thread. */
const daySeparator = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const time = clock(iso);
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  if (now.getTime() - d.getTime() < 7 * 864e5)
    return `${d.toLocaleDateString([], { weekday: "long" })} ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
};

const initials = (name: string | null, phone: string) => {
  if (!name) return fmtPhone(phone).slice(1, 4);
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
};

/** New day, or more than an hour since the previous message. */
const needsSeparator = (cur: Msg, prev: Msg | undefined) => {
  if (!prev) return true;
  const a = new Date(prev.created_at);
  const b = new Date(cur.created_at);
  return a.toDateString() !== b.toDateString() || b.getTime() - a.getTime() > 36e5;
};

export default function MessagesView({ canCall, embedded = false }: { canCall: boolean; embedded?: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [setup, setSetup] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newTo, setNewTo] = useState("");
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: "", company: "", notes: "" });

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
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
      const res = await fetch(`/api/messages?phone=${encodeURIComponent(phone)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setMsgs(data.messages ?? []);
    } catch {
      /* offline */
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/messages?contacts=1", { cache: "no-store" });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    loadThreads();
    loadContacts();
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

  // Autosize the composer the way a native message box grows.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [draft]);

  const current = threads.find((t) => t.digits === sel) ?? null;
  const byId = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Only match on digits when the query actually contains some. Otherwise
    // q.replace(/\D/g,"") is "" and every number "includes" it, so searching a
    // name matched every thread in the list.
    const qDigits = q.replace(/\D/g, "");
    return threads
      .filter((t) => (showArchived ? t.archived : !t.archived))
      .filter(
        (t) =>
          !q ||
          (t.name ?? "").toLowerCase().includes(q) ||
          (qDigits.length > 0 && t.digits.includes(qDigits)) ||
          t.lastBody.toLowerCase().includes(q)
      );
  }, [threads, search, showArchived]);

  async function openThread(t: Thread) {
    setSel(t.digits);
    setComposing(false);
    setError("");
    setReplyTo(null);
    setShowInfo(false);
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
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      direction: "outbound",
      phone: to,
      body: text,
      sender_name: "You",
      status: "pending",
      created_at: new Date().toISOString(),
      reply_to_id: replyTo?.id ?? null,
    };
    setMsgs((m) => [...m, optimistic]);
    setDraft("");
    const parent = replyTo;
    setReplyTo(null);

    const res = await sendThreadMessage(to, text, parent?.id ?? null);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setMsgs((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(text);
      setReplyTo(parent);
      return;
    }
    if (composing) {
      setComposing(false);
      await loadThreads();
      setSel(to.replace(/\D/g, "").slice(-10));
    }
    loadThread(to);
  }

  async function react(m: Msg, key: string) {
    setActionsFor(null);
    const next = m.reaction === key ? null : key;
    setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, reaction: next } : x)));
    const res = await reactToMessage(m.id, next);
    if (res.error) setError(res.error);
  }

  async function call() {
    if (!current) return;
    setError("");
    const res = await callFromOfficeLine(current.phone);
    if (res.error) setError(res.error);
    else setError("Calling your phone now - answer to connect.");
  }

  async function persistContact() {
    if (!current) return;
    const res = await saveContact(
      current.phone,
      contactDraft.name,
      contactDraft.company,
      contactDraft.notes
    );
    if (res.error) return setError(res.error);
    setShowInfo(false);
    loadThreads();
    loadContacts();
  }

  async function togglePin(t: Thread) {
    setThreads((cur) => cur.map((x) => (x.digits === t.digits ? { ...x, pinned: !x.pinned } : x)));
    const res = await setThreadPinned(t.phone, !t.pinned);
    if (res.error) setError(res.error);
    else loadThreads();
  }

  async function toggleArchive(t: Thread) {
    setThreads((cur) => cur.filter((x) => x.digits !== t.digits));
    if (sel === t.digits) setSel(null);
    const res = await setThreadArchived(t.phone, !t.archived);
    if (res.error) setError(res.error);
    else loadThreads();
  }

  const showConvo = sel !== null || composing;
  const picker = newTo.trim()
    ? contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(newTo.toLowerCase()) ||
          c.digits.includes(newTo.replace(/\D/g, ""))
      )
    : contacts;

  return (
    <div className={`md:flex ${embedded ? "md:h-full" : "md:h-screen"} bg-cream`}>
      {/* ── Conversation list ─────────────────────────────────── */}
      <div
        className={`${showConvo ? "hidden md:flex" : "flex"} md:w-[360px] md:border-r md:border-cream-dark flex-col ${embedded ? "min-h-[60vh]" : "min-h-screen"} md:min-h-0`}
      >
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-[28px] font-light text-charcoal leading-none">
              {showArchived ? "Archived" : "Messages"}
            </h2>
            <button
              onClick={() => {
                setComposing(true);
                setSel(null);
                setMsgs([]);
                setNewTo("");
                setError("");
              }}
              aria-label="New message"
              className="min-h-tap min-w-tap w-10 h-10 flex items-center justify-center rounded-full bg-green-primary text-cream"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full px-3.5 py-2 rounded-xl bg-cream-dark/50 text-charcoal font-body text-sm placeholder:text-charcoal/35 focus:outline-none focus:ring-2 focus:ring-green-primary/25"
          />
        </div>

        {(setup || !configured) && (
          <div className="mx-3 mb-2 rounded-xl border border-gold-primary/40 bg-gold-primary/10 p-3">
            <p className="text-xs font-body text-charcoal leading-relaxed">
              {setup
                ? "Run supabase/messaging.sql, then supabase/messaging_v2.sql, in the Supabase SQL editor to turn on the inbox."
                : "Texting goes live once the Twilio credentials are added. Until then, outgoing messages are saved as pending."}
            </p>
          </div>
        )}

        <div className="md:flex-1 md:overflow-auto px-2 pb-4">
          {visible.map((t) => (
            <div key={t.digits} className="group relative">
              <button
                onClick={() => openThread(t)}
                className={`w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-xl transition-colors ${
                  sel === t.digits ? "bg-green-primary/8" : "hover:bg-cream-dark/40"
                }`}
              >
                {t.unread > 0 ? (
                  <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-green-primary self-center -ml-1 mr-0.5" />
                ) : (
                  <span className="shrink-0 w-2.5 -ml-1 mr-0.5" />
                )}
                <span className="shrink-0 w-11 h-11 rounded-full bg-green-primary/12 text-green-primary font-body text-sm font-semibold flex items-center justify-center self-center">
                  {initials(t.name, t.phone)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="font-body text-[15px] font-semibold text-charcoal truncate">
                      {t.name ?? fmtPhone(t.phone)}
                    </span>
                    {t.pinned && <span className="text-[10px] text-gold-dark shrink-0">PINNED</span>}
                    <span className="ml-auto shrink-0 text-[11px] text-charcoal/40 font-body">
                      {listStamp(t.lastAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`flex-1 text-[13px] font-body line-clamp-2 ${
                        t.unread > 0 ? "text-charcoal/75" : "text-charcoal/45"
                      }`}
                    >
                      {t.lastDirection === "outbound" ? "You: " : ""}
                      {t.lastBody}
                    </span>
                  </span>
                </span>
              </button>

              {/* Row actions, desktop hover */}
              <div className="hidden md:flex absolute right-2 top-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(t); }}
                  title={t.pinned ? "Unpin" : "Pin"}
                  className="px-2 py-1 rounded-lg bg-cream border border-cream-dark text-[10px] font-body uppercase tracking-wide text-charcoal/60"
                >
                  {t.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleArchive(t); }}
                  title={t.archived ? "Unarchive" : "Archive"}
                  className="px-2 py-1 rounded-lg bg-cream border border-cream-dark text-[10px] font-body uppercase tracking-wide text-charcoal/60"
                >
                  {t.archived ? "Restore" : "Archive"}
                </button>
              </div>
            </div>
          ))}

          {visible.length === 0 && !setup && (
            <p className="text-center text-charcoal/40 font-body py-12 text-sm px-6">
              {search
                ? "No conversations match that."
                : showArchived
                ? "Nothing archived."
                : "No conversations yet. Texts to the office number land here."}
            </p>
          )}

          <button
            onClick={() => setShowArchived((v) => !v)}
            className="w-full mt-2 py-2 text-[11px] font-body uppercase tracking-widest text-charcoal/40"
          >
            {showArchived ? "Back to inbox" : "Archived"}
          </button>
        </div>
      </div>

      {/* ── Conversation ──────────────────────────────────────── */}
      <div className={`${showConvo ? "flex" : "hidden md:flex"} flex-1 flex-col ${embedded ? "md:h-full min-h-[80vh]" : "md:h-screen min-h-screen"} md:min-h-0`}>
        {current || composing ? (
          <>
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-cream-dark flex items-center gap-2.5 bg-cream/95 backdrop-blur sticky top-0 z-10">
              <button
                onClick={() => { setSel(null); setComposing(false); setShowInfo(false); }}
                className="md:hidden min-h-tap min-w-tap w-9 h-9 flex items-center justify-center text-green-primary"
                aria-label="Back"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {composing ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm font-body text-charcoal/45">To:</span>
                  <input
                    value={newTo}
                    onChange={(e) => setNewTo(e.target.value)}
                    placeholder="Name or number"
                    inputMode="tel"
                    autoFocus
                    className="flex-1 py-1.5 bg-transparent text-charcoal font-body text-sm focus:outline-none"
                  />
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setContactDraft({ name: current!.name ?? "", company: "", notes: "" });
                      setShowInfo((v) => !v);
                    }}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <span className="shrink-0 w-9 h-9 rounded-full bg-green-primary/12 text-green-primary font-body text-xs font-semibold flex items-center justify-center">
                      {initials(current!.name, current!.phone)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-body text-[15px] font-semibold text-charcoal truncate">
                        {current!.name ?? fmtPhone(current!.phone)}
                      </span>
                      <span className="block text-[11px] text-charcoal/40 font-body">
                        {current!.name ? fmtPhone(current!.phone) : "Not in contacts"}
                      </span>
                    </span>
                  </button>

                  {canCall && (
                    <button
                      onClick={call}
                      aria-label="Call"
                      className="min-h-tap min-w-tap w-9 h-9 flex items-center justify-center rounded-full text-green-primary"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Contact / info panel */}
            {showInfo && current && (
              <div className="border-b border-cream-dark bg-cream-dark/25 px-4 py-3.5 space-y-2.5">
                <p className="text-[11px] font-body uppercase tracking-widest text-charcoal/40">
                  {current.nameSource === "customer"
                    ? "Customer"
                    : current.nameSource === "prospect"
                    ? "Prospect"
                    : current.nameSource === "contact"
                    ? "Saved contact"
                    : "Unknown number"}
                </p>
                {current.customerId && (
                  <a
                    href={`/dispatch/customers?id=${current.customerId}`}
                    className="block text-sm font-body text-green-primary underline"
                  >
                    Open customer record
                  </a>
                )}
                {current.nameSource !== "customer" && current.nameSource !== "prospect" && (
                  <div className="space-y-2">
                    <input
                      value={contactDraft.name}
                      onChange={(e) => setContactDraft({ ...contactDraft, name: e.target.value })}
                      placeholder="Name"
                      className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
                    />
                    <input
                      value={contactDraft.company}
                      onChange={(e) => setContactDraft({ ...contactDraft, company: e.target.value })}
                      placeholder="Company (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm focus:outline-none focus:border-green-primary"
                    />
                    <textarea
                      value={contactDraft.notes}
                      onChange={(e) => setContactDraft({ ...contactDraft, notes: e.target.value })}
                      placeholder="Notes (optional)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-cream-dark bg-cream text-charcoal font-body text-sm resize-none focus:outline-none focus:border-green-primary"
                    />
                    <button
                      onClick={persistContact}
                      className="min-h-tap px-4 py-2 bg-green-primary text-cream rounded-lg text-xs font-body uppercase tracking-widest"
                    >
                      Save contact
                    </button>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => togglePin(current)}
                    className="px-3 py-1.5 rounded-lg border border-cream-dark text-xs font-body text-charcoal/70"
                  >
                    {current.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    onClick={() => { markThreadUnread(current.phone); loadThreads(); setShowInfo(false); }}
                    className="px-3 py-1.5 rounded-lg border border-cream-dark text-xs font-body text-charcoal/70"
                  >
                    Mark unread
                  </button>
                  <button
                    onClick={() => toggleArchive(current)}
                    className="px-3 py-1.5 rounded-lg border border-cream-dark text-xs font-body text-charcoal/70"
                  >
                    {current.archived ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            )}

            {/* Contact picker while composing */}
            {composing && (
              <div className="flex-1 overflow-auto">
                {picker.slice(0, 60).map((c) => (
                  <button
                    key={c.digits}
                    onClick={() => setNewTo(c.digits)}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-cream-dark/60 hover:bg-cream-dark/30"
                  >
                    <span className="w-9 h-9 rounded-full bg-green-primary/12 text-green-primary font-body text-xs font-semibold flex items-center justify-center shrink-0">
                      {initials(c.name, c.digits)}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-body text-sm text-charcoal truncate">{c.name}</span>
                      <span className="block text-[11px] font-body text-charcoal/40">
                        {fmtPhone(c.digits)} · {c.source}
                      </span>
                    </span>
                  </button>
                ))}
                {picker.length === 0 && (
                  <p className="text-center text-charcoal/40 font-body py-10 text-sm">
                    No matching contacts. Type a full number to text it anyway.
                  </p>
                )}
              </div>
            )}

            {/* Messages */}
            {!composing && (
              <div className="flex-1 overflow-auto px-3 py-4 bg-cream">
                {msgs.map((m, i) => {
                  const prev = msgs[i - 1];
                  const next = msgs[i + 1];
                  const out = m.direction === "outbound";
                  const sameAsPrev = prev && prev.direction === m.direction && !needsSeparator(m, prev);
                  const sameAsNext =
                    next && next.direction === m.direction && !needsSeparator(next, m);
                  const parent = m.reply_to_id ? byId.get(m.reply_to_id) : null;
                  const tap = glyphFor(m.reaction);
                  const lastOutbound =
                    out && !msgs.slice(i + 1).some((x) => x.direction === "outbound");

                  return (
                    <div key={m.id}>
                      {needsSeparator(m, prev) && (
                        <div className="text-center py-3">
                          <span className="text-[11px] font-body text-charcoal/35">
                            {daySeparator(m.created_at)}
                          </span>
                        </div>
                      )}

                      <div
                        className={`flex ${out ? "justify-end" : "justify-start"} ${
                          sameAsPrev ? "mt-0.5" : "mt-2"
                        }`}
                      >
                        <div className={`max-w-[80%] ${tap ? "mb-3" : ""}`}>
                          {/* Quoted parent. Deliberately small, faded, and
                              inset so it reads as context attached to the reply
                              below it rather than as another message - at full
                              width it looks like the thread said it twice. */}
                          {parent && (
                            <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`mb-0.5 max-w-[80%] px-2.5 py-1 rounded-xl bg-cream-dark/45 border-l-2 border-green-primary/30 opacity-80 ${
                                  out ? "mr-3" : "ml-3"
                                }`}
                              >
                                <p className="text-[9px] font-body uppercase tracking-wide text-charcoal/35 leading-tight">
                                  {parent.direction === "outbound" ? "You" : current?.name ?? "Them"}
                                </p>
                                <p className="text-[11px] font-body text-charcoal/45 line-clamp-1 leading-snug">
                                  {/* Truncated in JS, not just clipped in CSS:
                                      the full text would still be read aloud by
                                      a screen reader and still be findable, so
                                      the quote would read as a second copy of
                                      the message. */}
                                  {parent.body.length > 60 ? `${parent.body.slice(0, 60)}…` : parent.body}
                                </p>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => setActionsFor(actionsFor === m.id ? null : m.id)}
                            className={`relative block w-full text-left px-3.5 py-2 ${
                              out
                                ? "bg-green-primary text-cream"
                                : "bg-cream-dark/70 text-charcoal"
                            } ${
                              out
                                ? `rounded-l-[18px] ${sameAsPrev ? "rounded-tr-md" : "rounded-tr-[18px]"} ${
                                    sameAsNext ? "rounded-br-md" : "rounded-br-[18px]"
                                  }`
                                : `rounded-r-[18px] ${sameAsPrev ? "rounded-tl-md" : "rounded-tl-[18px]"} ${
                                    sameAsNext ? "rounded-bl-md" : "rounded-bl-[18px]"
                                  }`
                            }`}
                          >
                            {(m.media_urls ?? []).length > 0 && (
                              <span className="block space-y-1 mb-1">
                                {(m.media_urls ?? []).map((u) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    key={u}
                                    src={u}
                                    alt="Attachment"
                                    className="rounded-xl max-h-64 w-auto"
                                  />
                                ))}
                              </span>
                            )}
                            <span className="block font-body text-[15px] leading-snug whitespace-pre-wrap break-words">
                              {m.body}
                            </span>

                            {tap && (
                              <span
                                className={`absolute -top-3 ${
                                  out ? "-left-2" : "-right-2"
                                } bg-cream border border-cream-dark rounded-full w-6 h-6 flex items-center justify-center text-[11px] shadow-sm`}
                              >
                                {tap}
                              </span>
                            )}
                          </button>

                          {/* Status line under the last outbound bubble */}
                          {lastOutbound && (
                            <p className="text-[10px] font-body text-charcoal/35 text-right mt-0.5 pr-1">
                              {m.status === "pending"
                                ? "Sending"
                                : m.status === "failed"
                                ? "Not delivered"
                                : m.status === "delivered"
                                ? "Delivered"
                                : "Sent"}
                              {m.sender_name && m.sender_name !== "You" ? ` · ${m.sender_name}` : ""}
                            </p>
                          )}

                          {/* Action sheet */}
                          {actionsFor === m.id && (
                            <div
                              className={`mt-1.5 p-2 rounded-2xl bg-cream border border-cream-dark shadow-lg ${
                                out ? "ml-auto" : ""
                              }`}
                            >
                              <div className="flex gap-1 justify-between mb-1.5">
                                {TAPBACKS.map((t) => (
                                  <button
                                    key={t.key}
                                    onClick={() => react(m, t.key)}
                                    title={t.label}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[15px] ${
                                      m.reaction === t.key ? "bg-green-primary/15" : "hover:bg-cream-dark/60"
                                    }`}
                                  >
                                    {t.glyph}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-1 border-t border-cream-dark pt-1.5">
                                <button
                                  onClick={() => { setReplyTo(m); setActionsFor(null); taRef.current?.focus(); }}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-body text-charcoal/70 hover:bg-cream-dark/50"
                                >
                                  Reply
                                </button>
                                <button
                                  onClick={() => { navigator.clipboard?.writeText(m.body); setActionsFor(null); }}
                                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-body text-charcoal/70 hover:bg-cream-dark/50"
                                >
                                  Copy
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {msgs.length === 0 && (
                  <p className="text-center text-charcoal/35 font-body py-12 text-sm">
                    No messages yet. Say hello.
                  </p>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {error && <p className="px-4 py-1.5 text-xs font-body text-gold-dark">{error}</p>}

            {/* Reply banner */}
            {replyTo && (
              <div className="px-3 pt-2 flex items-start gap-2">
                <div className="flex-1 px-3 py-1.5 rounded-xl bg-cream-dark/60 border-l-2 border-green-primary/50">
                  <p className="text-[10px] font-body uppercase tracking-wide text-charcoal/40">
                    Replying to {replyTo.direction === "outbound" ? "you" : current?.name ?? "them"}
                  </p>
                  <p className="text-[12px] font-body text-charcoal/55 line-clamp-1">{replyTo.body}</p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="min-h-tap min-w-tap w-8 h-8 flex items-center justify-center text-charcoal/40"
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Composer */}
            <div className="p-3 flex items-end gap-2 border-t border-cream-dark bg-cream">
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={composing ? "Message" : "Text from the office number"}
                className="flex-1 px-4 py-2.5 rounded-[20px] border border-cream-dark bg-cream text-charcoal font-body text-[15px] resize-none focus:outline-none focus:border-green-primary/60 max-h-[140px]"
              />
              <button
                onClick={send}
                disabled={busy || !draft.trim() || (composing && !newTo.trim())}
                aria-label="Send"
                className="min-h-tap min-w-tap w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-green-primary text-cream disabled:opacity-30 transition-opacity"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="hidden md:flex h-full items-center justify-center text-charcoal/25 font-body">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
