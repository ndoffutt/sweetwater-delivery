import { redirect } from "next/navigation";

// The scan flow now lives directly on /dispatch (the Dispatch console).
export default function ScanRedirect() {
  redirect("/dispatch");
}
