import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// Same shared office-number inbox, reachable from the driver map. Owner-only
// while messaging awaits Twilio approval.
export default async function DriverMessagesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/driver");
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
