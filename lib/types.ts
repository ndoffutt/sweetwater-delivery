import type { DeliveryDay } from "@/lib/deliveryDay";

// "dispatcher" is the Manager role (kept for back-compat with existing
// sessions/rows); "admin" is a superset reserved for owner-level surfaces.
export type UserRole = "driver" | "dispatcher" | "admin";
export type RouteStatus = "draft" | "dispatched" | "in_progress" | "completed";
export type StopStatus = "pending" | "arrived" | "completed" | "skipped";

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface Customer {
  id: string;
  name: string;
  // Canonical one-line address (geocoding/maps/display). street/town/zip are
  // the editable parts, composed back into `address` on save; email is captured
  // for delivery customers. All optional until the address-split migration runs.
  address: string;
  street?: string | null;
  town?: string | null;
  zip?: string | null;
  email?: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  gate_code: string | null;
  delivery_notes: string | null;
  tags: string[] | null;
  spot_account: string | null;
  account_type: string | null;
  route_seq: number | null;
  // Run days for this customer. Thursday = east of the shop (East Hampton
  // town), Wednesday = west, Monday = small commercial-only run. A customer can
  // be on more than one (e.g. a twice-weekly commercial account).
  delivery_days?: DeliveryDay[] | null;
  active: boolean;
  // Too far to service right now: shelved from route building + the master
  // route, but kept in the directory so it can be brought back. Optional until
  // the out_of_range migration runs.
  out_of_range?: boolean | null;
  created_at: string;
}

export interface Route {
  id: string;
  date: string;
  driver_id: string;
  status: RouteStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  stops?: RouteStop[];
}

export interface RouteStop {
  id: string;
  route_id: string;
  customer_id: string;
  stop_order: number;
  status: StopStatus;
  has_dropoff: boolean;
  has_pickup: boolean;
  dropoff_confirmed: boolean;
  pickup_confirmed: boolean;
  // Driver went, but the customer had nothing out — satisfies the pickup
  // obligation without a photo or a skip. Optional until the migration runs.
  pickup_none?: boolean;
  notes: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  created_at: string;
  customer?: Customer;
  photos?: StopPhoto[];
  // Optional: when set, this stop isn't a delivery — it's a planned prospect
  // visit rendered into the same driver flow.
  kind?: "delivery" | "prospect_visit";
  prospect_visit?: {
    id: string;            // route_prospect_visits.id (for completeProspectVisit)
    prospect_id: string;
    name: string;
    address: string | null;
    phone: string | null;
    notes_summary: string | null;       // most recent prospect notes
    last_visit_at: string | null;       // null if never
    history: { id: string; type: string; note: string | null; created_by: string | null; created_at: string }[];
  };
}

export interface StopPhoto {
  id: string;
  stop_id: string;
  storage_path: string;
  // Which service the photo proves. Null/undefined = legacy photo taken before
  // the photo_kinds migration; treated as wildcard proof.
  kind?: "dropoff" | "pickup" | null;
  url?: string;
  created_at: string;
}

// new: spotted, never contacted · working: in conversation · active: customer
// now · on_hold: revisit later · dead: never winnable
export type ProspectStatus = "new" | "working" | "active" | "on_hold" | "dead";
// What an active account buys.
export type ProspectService = "employees" | "linen" | "referral";
// "Commercial" is the umbrella (the tag a won prospect gets in the customer
// directory); these are the segments within it.
export type ProspectBusinessType =
  | "hotel"
  | "club"
  | "restaurant"
  | "retail"
  | "prop_manager"
  | "other";
export type TouchpointType = "call" | "email" | "text" | "visit" | "delivery" | "note";
export type ProspectPriority = "low" | "medium" | "high";

export interface Prospect {
  id: string;
  name: string;
  contact_name: string | null;
  contact_title: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  town: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  business_type: ProspectBusinessType;
  status: ProspectStatus;
  priority?: ProspectPriority | null;
  services: ProspectService[];
  notes: string | null;
  customer_id: string | null;
  created_at: string;
  // Prospect outreach is phone/email only — no physical location to visit.
  // Address becomes optional, the prospect is hidden from the map, and the
  // overdue badge shows a phone icon instead of a pin.
  call_only?: boolean | null;
  // Dispatcher-set "please reach out" flag. When set, the prospect appears in
  // the overdue list regardless of cadence, with a "MANUAL REQUEST" badge.
  // Cleared automatically by the next non-note touchpoint (call/email/text/
  // visit/delivery).
  manual_request_at?: string | null;
  touchpoints?: ProspectTouchpoint[];
}

export interface ProspectTouchpoint {
  id: string;
  prospect_id: string;
  type: TouchpointType;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DriverLocation {
  id: string;
  driver_id: string;
  route_id: string | null;
  lat: number;
  lng: number;
  accuracy: number | null;
  created_at: string;
}
