import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MgrShell from "@/components/MgrShell";

export default async function DispatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "dispatcher" && session.role !== "admin") redirect("/driver");

  return (
    <MgrShell userName={session.name} role={session.role}>
      {children}
    </MgrShell>
  );
}
