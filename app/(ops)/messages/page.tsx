import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThreadTable } from "@/lib/opsData";
import { SubNav, SegLinks, btnSecondary } from "@/components/ops/Bits";
import NeedsReplyRow from "@/components/ops/NeedsReplyRow";
import { easternToday } from "@/lib/date";

export const dynamic = "force-dynamic";

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
  // Archived conversations are handled — they don't belong on the needs-reply
  // list. (They still resurface here the moment new activity comes in.)
  const rows = (await getThreadTable(supabase)).filter((r) => !r.archived);
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
        action={<Link href="/messages/threads" className={btnSecondary}>New message</Link>}
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
          <div className="hidden md:grid grid-cols-[74px_210px_1fr_150px_96px_120px] gap-4 border-b border-ops-divider pb-2">
            {["Channel", "Who", "Message", "About", "Waiting", ""].map((h, i) => (
              <div key={i} className="font-barlowc font-semibold uppercase text-[11px] tracking-[0.08em] text-[rgba(26,26,26,.62)]">{h}</div>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="py-8 text-[15px] text-[rgba(26,26,26,.68)]">Nothing here.</p>
          )}
          {filtered.map((r, i) => (
            <NeedsReplyRow key={r.digits} r={r} primary={i === 0} />
          ))}
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
