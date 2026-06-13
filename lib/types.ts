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
  address: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  gate_code: string | null;
  delivery_notes: string | null;
  tags: string[] | null;
  spot_account: string | null;
  account_type: string | null;
  route_seq: number | null;
  // Run days for this customer. Wednesday = east of the shop (East Hampton
  // town), Thursday = west, Monday = small commercial-only run. A customer can
  // be on more than one (e.g. a twice-weekly commercial account).
  delivery_days?: DeliveryDay[] | null;
  active: boolean;
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
  notes: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  created_at: string;
  customer?: Customer;
  photos?: StopPhoto[];
}

export interface StopPhoto {
  id: string;
  stop_id: string;
  storage_path: string;
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
export type TouchpointType = "call" | "email" | "text" | "visit" | "note";

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
  services: ProspectService[];
  notes: string | null;
  customer_id: string | null;
  created_at: string;
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
