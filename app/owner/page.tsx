import { redirect } from "next/navigation";

// The separate owner home is gone — one console, one navigation. Old bookmarks
// and the PWA start URL land on the console instead.
export default function OwnerPage() {
  redirect("/dispatch");
}
