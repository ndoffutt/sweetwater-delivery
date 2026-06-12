import Link from "next/link";
import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// Same shared office-number inbox as the manager console, reachable from the
// driver map so texts can be read and answered from the road.
export default function DriverMessagesPage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="bg-green-primary text-cream px-4 py-3 flex items-center gap-3">
        <Link href="/driver" className="font-body text-sm">← Map</Link>
        <span className="font-serif text-lg font-light">Messages</span>
      </div>
      <div className="flex-1">
        <MessagesView canCall={callConfigured()} />
      </div>
    </div>
  );
}
