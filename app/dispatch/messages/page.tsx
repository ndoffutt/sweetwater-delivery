import MessagesView from "@/components/MessagesView";
import { callConfigured } from "@/lib/messaging";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  return <MessagesView canCall={callConfigured()} />;
}
