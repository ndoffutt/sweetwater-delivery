import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BouncieSetup from "@/components/BouncieSetup";

export const dynamic = "force-dynamic";

export default async function BouncieSetupPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dispatch");
  const raw = searchParams?.code;
  const code = Array.isArray(raw) ? raw[0] : raw;
  return <BouncieSetup initialCode={code ?? ""} />;
}
