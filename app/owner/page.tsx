import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

// Old bookmarks and the PWA start URL: the owner lands on the Ops Hub, the
// manager on the console, the driver on the route.
export default async function OwnerPage() {
  const session = await getSession();
  if (!session) redirect("/");
  redirect(session.role === "admin" ? "/today" : session.role === "driver" ? "/driver" : "/dispatch");
}
