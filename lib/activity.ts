import { createAdminClient } from "@/lib/supabase/admin";

export interface ActivityItem {
  id: string;
  icon: string;
  title: string;
  detail: string;
  who: string | null;
  at: string; // ISO
  href?: string; // set for clickable items (e.g. a delivery's detail page)
}

const TOUCH_ICON: Record<string, string> = {
  visit: "🚪",
  delivery: "🚐",
  call: "📞",
  email: "✉️",
  text: "💬",
  note: "📝",
};

// Recent app activity for the home dashboard: completed deliveries + prospect
// touchpoints (visits, calls, notes, …), newest first. Each source is
// best-effort so a missing table never breaks the home page.
export async function getRecentActivity(limit = 20): Promise<ActivityItem[]> {
  const supabase = createAdminClient();

  const stopsP = supabase
    .from("route_stops")
    .select("id, completed_at, has_dropoff, has_pickup, customers(name), deleted_at")
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  // Exclude type='delivery' — those are auto-logged alongside every route_stop
  // completion, so including them here would double every delivery in the feed.
  // The route_stops query above is the authoritative record (carries photos +
  // notes + a working /dispatch/delivery/[id] link).
  // Also exclude soft-deleted touchpoints (the deletion is captured in
  // deletion_audit / Settings → Recently Deleted, not the activity feed).
  const touchesP = supabase
    .from("prospect_touchpoints")
    .select("id, type, note, created_by, created_at, prospect_id, prospects(name), deleted_at")
    .neq("type", "delivery")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const [{ data: stops }, touchesRes] = await Promise.all([stopsP, touchesP]);
  const touches = touchesRes.data; // may error if prospects tables absent

  const items: ActivityItem[] = [];

  for (const s of (stops ?? []) as unknown as {
    id: string; completed_at: string; has_dropoff: boolean; has_pickup: boolean;
    customers: { name: string } | null;
  }[]) {
    const detail =
      s.has_dropoff && s.has_pickup ? "Drop-off & pickup"
      : s.has_pickup ? "Picked up"
      : "Delivered";
    items.push({
      id: `stop-${s.id}`,
      icon: "🚐",
      title: s.customers?.name ?? "Customer",
      detail,
      who: null,
      at: s.completed_at,
      href: `/dispatch/delivery/${s.id}`,
    });
  }

  for (const t of (touches ?? []) as unknown as {
    id: string; type: string; note: string | null; created_by: string | null;
    created_at: string; prospect_id: string; prospects: { name: string } | null;
  }[]) {
    const label = t.type.charAt(0).toUpperCase() + t.type.slice(1);
    items.push({
      id: `touch-${t.id}`,
      icon: TOUCH_ICON[t.type] ?? "•",
      title: t.prospects?.name ?? "Prospect",
      detail: t.note ? `${label} — ${t.note}` : label,
      who: t.created_by,
      at: t.created_at,
      href: `/sales/prospects?id=${t.prospect_id}`,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
