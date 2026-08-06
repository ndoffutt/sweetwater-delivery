import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

// Owner + manager now, matching the Twilio rollout opening up to Ahsin.
// In practice this route redirects to /messages before it ever renders
// (middleware mirrors both roles into the ops shell) — this gate is just
// defense in depth for whatever reaches it directly.
export default async function MessagesPage() {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "dispatcher")) redirect("/dispatch");
  return <MessagesView canCall={callConfigured()} />;
}
