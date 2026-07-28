import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BouncieSetup from "@/components/BouncieSetup";

export const dynamic = "force-dynamic";

export default async function BouncieSetupPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dispatch");
  return <BouncieSetup />;
}
