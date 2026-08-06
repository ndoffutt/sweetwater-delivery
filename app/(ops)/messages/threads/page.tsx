import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Threads — the full conversation view (reply, compose, tapbacks, contacts),
// embedded in the Ops Hub shell. The wrapper subtracts the 68px header and
// 48px sub-nav so the composer stays on screen (without it, md:h-screen pushed
// the message box below the fold — compose looked broken).
export default function ThreadsPage({
  searchParams,
}: {
  searchParams?: { open?: string; name?: string };
}) {
  return (
    <>
      <SubNav
        items={[
          { label: "Needs reply", href: "/messages" },
          { label: "Threads", href: "/messages/threads", active: true },
        ]}
      />
      <div className="md:h-[calc(100vh-116px)] md:overflow-hidden">
        <MessagesView
          canCall={callConfigured()}
          embedded
          initialPhone={searchParams?.open ?? null}
          initialName={searchParams?.name ?? null}
        />
      </div>
    </>
  );
}
