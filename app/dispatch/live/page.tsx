import { redirect } from "next/navigation";

// Live tracking is part of Today now (map, ticking stops, van position). This
// page had lost its nav entry and survived only as a typed URL — redirect it.
export default function LivePage() {
  redirect("/dispatch");
}
