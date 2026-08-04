import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThreadTable } from "@/lib/opsData";
import { SubNav, SegLinks, Tag, btnPrimary, btnSecondary } from "@/components/ops/Bits";
import { easternToday } from "@/lib/date";

export const dynamic = "force-dynamic";

const ageLabel = (iso: string) => {
  const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000));
  if (h < 1) return "just now";
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};
const isStale = (iso: string) => Date.now() - new Date(iso).getTime() > 2 * 86400000;

// Messages — one place for every inbound and outbound message on the
// business's own channels. SMS is live today; the Channel column and the
// About column are built so email drops in beside it when the shared-mailbox
// sync is connected, without reshaping the table.
export default async function MessagesPage({
  searchParams,
}: {
  searchParams?: { f?: string };
}) {
  const supabase = createAdminClient();
  const rows = await getThreadTable(supabase);
  const filter = searchParams?.f === "delivery" ? "delivery" : searchParams?.f === "not" ? "not" : "all";

  const filtered = rows.filter((r) =>
    filter === "delivery" ? r.deliveryRelated : filter === "not" ? !r.deliveryRelated : true
  );
  const waiting = rows.filter((r) => r.waitingSince).length;

  // Automated sends today (the out-for-delivery texts and friends).
  let autoToday = { count: 0, delivered: 0, failed: 0 };
  try {
    const { data } = await supabase
      .from("text_messages")
      .select("status")
      .eq("sender_name", "Auto")
      .gte("created_at", easternToday() + "T00:00:00")
      .limit(500);
    const list = (data ?? []) as { status: string }[];
    autoToday = {
      count: list.length,
      delivered: list.filter((m) => m.status === "delivered" || m.status === "sent").length,
      failed: list.filter((m) => m.status === "failed" || m.status === "undelivered").length,
    };
  } catch { /* table missing — zeros */ }

  return (
    <>
      <SubNav
        items={[
          { label: "Needs reply", href: "/messages", active: true, count: waiting },
          { label: "Threads", href: "/messages/threads" },
        ]}
        action={<Link href="/messages/threads" className={btnSecondary}>Compose</Link>}
      />
      <div className="mx-auto max-w-[1440px] px-5 md:px-12">
        <div className="pt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-barlowc font-semibold text-[30px] md:text-[40px] leading-none">Needs reply</h1>
            <p className="mt-2 text-[13px] text-[rgba(26,26,26,.62)]">
              Office line texts · email joins when the shared mailbox is connected
            </p>
          </div>
          <SegLinks
            options={[
              { label: "Everything", href: "/messages", selected: filter === "all" },
              { label: "Delivery", href: "/messages?f=delivery", selected: filter === "delivery" },
              { label: "Not delivery", href: "/messages?f=not", selected: filter === "not" },
            ]}
          />
        </div>

        {/* ── Table (desktop) / stacked rows (mobile) ── */}
        <div className="mt-6">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[74px_210px_1fr_150px_96px_96px] gap-4 border-b border-ops-divider pb-2">
            {["Channel", "Who", "Message", "About", "Waiting", ""].map((h, i) => (
              <div key={i} className="font-barlowc font-semibold uppercase text-[11px] tracking-[0.08em] text-[rgba(26,26,26,.62)]">{h}</div>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-8 text-[15px] text-[rgba(26,26,26,.68)]">Nothing here.</p>
          )}
          {filtered.map((r, i) => {
            const action = r.waitingSince
              ? { label: i === 0 ? "Reply" : "Open", primary: i === 0 }
              : { label: "Open", primary: false };
            return (
              <div
                key={r.digits}
                className="grid grid-cols-[64px_1fr_auto] md:grid-cols-[74px_210px_1fr_150px_96px_96px] gap-x-4 gap-y-1 items-center border-b border-[rgba(26,26,26,.08)] py-3 hover:bg-[rgba(26,26,26,.035)]"
              >
                <div className="flex flex-col gap-1">
                  {r.channels.map((c) => <Tag key={c} tone="neutral">{c === "text" ? "Text" : "Email"}</Tag>)}
                </div>
                <div className="font-barlow font-medium text-[15px] truncate">{r.name}</div>
                <div className="col-span-3 md:col-span-1 text-[14px] text-[rgba(26,26,26,.78)] truncate row-start-2 md:row-start-auto col-start-1 md:col-start-auto">
                  {r.lastBody ? `“${r.lastBody}”` : "—"}
                </div>
                <div className="hidden md:block text-[13px] text-[rgba(26,26,26,.68)]">{r.about}</div>
                <div className={`text-[13px] ${r.waitingSince && isStale(r.waitingSince) ? "text-ops-danger" : "text-[rgba(26,26,26,.68)]"} text-right md:text-left`}>
                  {r.waitingSince ? ageLabel(r.waitingSince) : ""}
                </div>
                <div className="hidden md:flex justify-end">
                  <Link href="/messages/threads" className={action.primary ? btnPrimary : btnSecondary}>{action.label}</Link>
                </div>
                {/* Mobile about-line + action */}
                <div className="md:hidden col-span-3 row-start-3 flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-[rgba(26,26,26,.62)]">{r.about}</span>
                  <Link href="/messages/threads" className={action.primary ? btnPrimary : btnSecondary}>{action.label}</Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Summaries ── */}
        <div className="mt-10 mb-6 md:grid md:grid-cols-2 md:gap-14">
          <div className="border-t border-ops-divider pt-3">
            <div className="font-barlowc font-semibold uppercase text-[11px] tracking-[0.1em] text-[rgba(26,26,26,.62)]">Sent automatically today</div>
            <p className="mt-2 text-[15px]">
              {autoToday.count === 0
                ? "No automated texts today — auto-texts are switched off until texting is fully proven."
                : `${autoToday.count} automated text${autoToday.count === 1 ? "" : "s"} · ${autoToday.delivered} delivered${autoToday.failed ? `, ${autoToday.failed} failed` : ""}`}
            </p>
          </div>
          <div className="border-t border-ops-divider pt-3 mt-6 md:mt-0">
            <div className="font-barlowc font-semibold uppercase text-[11px] tracking-[0.1em] text-[rgba(26,26,26,.62)]">Broadcasts</div>
            <p className="mt-2 text-[15px] text-[rgba(26,26,26,.68)]">
              None sent yet. Broadcasts arrive with the email channel.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
