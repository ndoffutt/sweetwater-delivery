import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LiveView from "@/components/LiveView";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await getSession();
  if (!session) redirect("/");
  return <LiveView />;
}
