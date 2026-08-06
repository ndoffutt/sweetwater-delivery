import { redirect } from "next/navigation";

// Retired: Threads and Needs-reply are one page now (/messages, filtered).
// Kept as a redirect so old links/bookmarks still land somewhere real.
export default function ThreadsPageRedirect({
  searchParams,
}: {
  searchParams?: { open?: string; name?: string };
}) {
  const params = new URLSearchParams();
  if (searchParams?.open) params.set("open", searchParams.open);
  if (searchParams?.name) params.set("name", searchParams.name);
  const qs = params.toString();
  redirect(`/messages${qs ? `?${qs}` : ""}`);
}
