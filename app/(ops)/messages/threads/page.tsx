import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";
import { SubNav } from "@/components/ops/Bits";

export const dynamic = "force-dynamic";

// Threads — the full conversation view (reply, compose, tapbacks, contacts),
// embedded in the Ops Hub shell. Same component the office number has always
// used, so nothing about sending changes.
export default function ThreadsPage() {
  return (
    <>
      <SubNav
        items={[
          { label: "Needs reply", href: "/messages" },
          { label: "Threads", href: "/messages/threads", active: true },
        ]}
      />
      <MessagesView canCall={callConfigured()} />
    </>
  );
}
