import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// Owner-only while messaging awaits Twilio approval - hidden from the Manager
// view (not in the nav, and direct URLs bounce back to Dispatch).
export default async function MessagesPage() {
  const session = await getSession();
  if (!session || session.role !== "admin") redirect("/dispatch");
  return <MessagesView canCall={callConfigured()} />;
}
