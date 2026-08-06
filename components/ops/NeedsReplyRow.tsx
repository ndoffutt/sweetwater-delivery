"use client";

// One row of the /messages "Needs reply" table. A client component only so
// the ✕ ("no reply needed") can hide the row immediately instead of a full
// page reload — everything else here is the same static row the server used
// to render directly.
import { useState } from "react";
import Link from "next/link";
import { Tag, btnPrimary, btnSecondary } from "@/components/ops/Bits";
import { reactToMessage } from "@/lib/actions/messages";

export interface NeedsReplyRowData {
  digits: string;
  channels: string[];
  name: string;
  lastBody: string;
  about: string;
  waitingSince: string | null;
  waitingMessageId: string | null;
}

const ageLabel = (iso: string) => {
  const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};
const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > 2 * 86400000;

export default function NeedsReplyRow({ r, primary }: { r: NeedsReplyRowData; primary: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const action = r.waitingSince ? { label: primary ? "Reply" : "Open", primary } : { label: "Open", primary: false };

  function dismiss() {
    setDismissed(true);
    if (r.waitingMessageId) void reactToMessage(r.waitingMessageId, "like").catch(() => {});
  }

  return (
    <div className="grid grid-cols-[64px_1fr_auto] md:grid-cols-[74px_210px_1fr_150px_96px_120px] gap-x-4 gap-y-1 items-center border-b border-[rgba(26,26,26,.08)] py-3 hover:bg-[rgba(26,26,26,.035)]">
      <div className="flex flex-col gap-1">
        {r.channels.map((c) => <Tag key={c} tone="neutral">{c === "text" ? "Text" : "Email"}</Tag>)}
      </div>
      <div className="font-barlow font-medium text-[15px] truncate">{r.name}</div>
      <div className="col-span-3 md:col-span-1 text-[14px] text-[rgba(26,26,26,.78)] truncate row-start-2 md:row-start-auto col-start-1 md:col-start-auto">
        {r.lastBody ? `"${r.lastBody}"` : "—"}
      </div>
      <div className="hidden md:block text-[13px] text-[rgba(26,26,26,.68)]">{r.about}</div>
      <div className={`text-[13px] ${r.waitingSince && isStale(r.waitingSince) ? "text-ops-danger" : "text-[rgba(26,26,26,.68)]"} text-right md:text-left`}>
        {r.waitingSince ? ageLabel(r.waitingSince) : ""}
      </div>
      <div className="hidden md:flex justify-end items-center gap-2">
        <Link href="/messages/threads" className={action.primary ? btnPrimary : btnSecondary}>{action.label}</Link>
        {r.waitingSince && (
          <button
            onClick={dismiss}
            title="No reply needed"
            aria-label="No reply needed"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-[rgba(26,26,26,.4)] hover:bg-[rgba(26,26,26,.06)] hover:text-[rgba(26,26,26,.7)]"
          >
            ✕
          </button>
        )}
      </div>
      {/* Mobile about-line + action */}
      <div className="md:hidden col-span-3 row-start-3 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-[rgba(26,26,26,.62)]">{r.about}</span>
        <div className="flex items-center gap-2">
          <Link href="/messages/threads" className={action.primary ? btnPrimary : btnSecondary}>{action.label}</Link>
          {r.waitingSince && (
            <button
              onClick={dismiss}
              title="No reply needed"
              aria-label="No reply needed"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-[rgba(26,26,26,.4)] hover:bg-[rgba(26,26,26,.06)] hover:text-[rgba(26,26,26,.7)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
