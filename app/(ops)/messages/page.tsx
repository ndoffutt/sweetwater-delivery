import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// One Threads view — filtered (all / delivery / not delivery / needs reply)
// instead of split across separate "Needs reply" and "Threads" pages. The
// wrapper subtracts the 68px header so the composer stays on screen (without
// it, md:h-screen pushed the message box below the fold — compose looked
// broken).
export default function MessagesPage({
  searchParams,
}: {
  searchParams?: { open?: string; name?: string };
}) {
  return (
    <div className="md:h-[calc(100vh-68px)] md:overflow-hidden">
      <MessagesView
        canCall={callConfigured()}
        embedded
        initialPhone={searchParams?.open ?? null}
        initialName={searchParams?.name ?? null}
      />
    </div>
  );
}
