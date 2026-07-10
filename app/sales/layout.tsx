import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MgrShell from "@/components/MgrShell";

// Prospects is a console tab (Today / Customers / Prospects / Record), so it
// uses the same shell as /dispatch — the nav must persist across every page.
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  // Owner and Manager both work sales; drivers don't.
  if (session.role !== "admin" && session.role !== "dispatcher") redirect("/driver");

  return (
    <MgrShell userName={session.name} role={session.role}>
      {children}
    </MgrShell>
  );
}
