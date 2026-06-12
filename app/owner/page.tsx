import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import OwnerHome from "@/components/OwnerHome";

export default async function OwnerPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") {
    redirect(session.role === "driver" ? "/driver" : "/dispatch");
  }

  return <OwnerHome name={session.name} />;
}
