# Handoff: Driver Flow — "Map-First" (Direction B)

> **This package covers two surfaces of one app.** This file is the **driver** brief. See **`README_MANAGER.md`** for the **manager / dispatch console**. They share one brand, one map treatment, and the same Supabase data — build them with shared components.

## Overview
This is a redesign of the **driver-facing experience** for Sweetwater's Delivery App. It replaces the current list-based driver flow (`app/driver/page.tsx` → `StopCard` list → `app/driver/stop/[id]` detail page) with a **map-first, single-screen experience** modeled on rideshare driver apps: the map is home, the active stop rides up in a bottom sheet, and the driver slides to confirm arrival.

The guiding constraint from the owner: **"an Uber driver off the street should be able to use it."** One obvious action per screen, large tap targets, no decisions the app can make for the driver.

## About the Design Files
The files in `design_files/` are **design references created in HTML/React (Babel-in-browser)** — prototypes that demonstrate the intended look, layout, and behavior. **They are not production code to copy directly.** Your job is to **recreate this design inside the existing Sweetwater's Next.js codebase**, reusing its established patterns:

- Next.js 14 App Router + TypeScript
- Tailwind CSS with the existing brand theme (`tailwind.config.ts`)
- Supabase (Postgres + Storage + Realtime) via the existing `lib/supabase/*` clients
- The existing server actions in `lib/actions/*` and types in `lib/types.ts`

The prototype uses inline styles and a mock data file; **use Tailwind classes and the real Supabase data** in the implementation.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final and should be matched closely. All brand values already exist in `tailwind.config.ts` (see Design Tokens). The one exception is the **map**, which is a stylized CSS/SVG placeholder in the prototype — see "The Map" below.

---

## How this maps to your existing code

| Prototype piece | Existing file to change / replace | Notes |
|---|---|---|
| Start screen | `components/LoginScreen.tsx` | Keep `loginDriver()` action + "Start Driving". Restyle to the dark map-themed splash (optional — current login is fine). |
| Map home + bottom sheet | **`app/driver/page.tsx`** (rewrite as/around a client component) | Today's biggest change. Replaces the `StopCard` list with a full-screen map + bottom sheet. |
| Stop detail (in sheet) | `components/StopDetail.tsx` | Reuse all of its logic/actions, but render **inside the bottom sheet** instead of a separate `/driver/stop/[id]` route. The dedicated route can stay as a fallback/deep-link. |
| Drop-off / Pick-up confirm | `confirmDropoff()`, `confirmPickup()` in `lib/actions/stops.ts` | Uses existing `has_dropoff`/`has_pickup` + `dropoff_confirmed`/`pickup_confirmed`. **No quantities** — just confirm/unconfirm. |
| Photo proof | `components/PhotoCapture.tsx` + `/api/photo` | Already built. Gate the "Complete Stop" button on `photos.length > 0` (see Photo-required). |
| Complete / arrive | `updateStopStatus()` in `lib/actions/stops.ts` | `arrived` and `completed` transitions already exist. |
| Auto-text customer | `sendSms()` in `lib/actions/stops.ts` | Currently manual. **Make it automatic** on arrive ("On our way") and complete ("Delivered") — see Interactions. |
| All-stops overview | new sheet, data already in `route.route_stops` | Tap the progress pill to open. |
| Route ordering | unchanged | Dispatcher pre-orders via `RouteBuilder`; driver just follows `stop_order`. |

---

## Screens / Views

### 1. Start screen
- **Purpose:** Driver taps once to begin the day's route.
- **Layout:** Full-bleed dark-green (`green-dark #015a30`) background with a faint stylized map underlay + gradient scrim. Centered column: circular gold-outlined monogram "S", serif wordmark "Sweetwater's", uppercase gold label "DELIVERY · DRIVER", then a full-width **gold** "Start Driving" button (with a navigation-arrow icon). Bottom caption: "8 stops · 14.2 mi today".
- **Action:** `loginDriver()` → navigate to `/driver`.

### 2. Map home (primary screen)
- **Layout:** The map fills the entire viewport. Floating chrome on top:
  - **Top-left → progress pill** (frosted white, `backdrop-blur`): a green rounded-square route icon, "{N} stops left" + a thin progress bar, "{done}/{total}", and a right-chevron. **Tapping it opens the All-Stops overview.**
  - **Top-right → sync chip** (50px square, frosted): cloud-check icon when **online**; turns **gold (`gold-primary`)** with a cloud icon + queued-count when **offline**.
  - **Right side, above the sheet → re-center button** (46px frosted square, blue navigation arrow).
  - **Pins:** numbered teardrop markers (rotated 45° square w/ white border). Pending = green, active/target = **gold & larger**, done = translucent green with a check. A blue "current location" dot with a halo.
  - **Route line:** dashed green polyline through the stops in order.
- **Bottom sheet (peek state):** rounded-top card pinned to the bottom with a grab handle. Shows the **active stop**:
  - Number badge + customer **name** (serif, 24px) + address line.
  - Right side: distance ("2.4 mi") + ETA ("~7 min"). *(Prototype values are static; compute from `customer.lat/lng` if available.)*
  - **Task chips:** "Drop-off" (green) and/or "Pick-up" (gold) — **no quantities** — plus a gate-code chip if present.
  - **Action zone:**
    - `Navigate` (gold button) → opens Google Maps directions (see Interactions).
    - `!` problem button (square, opens Problem sheet).
    - **Slide-to-arrive** control (the chosen interaction — see below).

### 3. Bottom sheet (expanded / detail)
Drag the handle (or it auto-expands on arrival). Adds, above the action zone:
- **Delivery notes** card (green-tinted) — e.g. gate instructions.
- **Tap-to-call** row (`tel:` link) with the customer phone.
- When **arrived**: "Confirm what you did" → **Dropped off** and/or **Picked up** check rows (large, toggle green when checked) + **Photo proof** section (required) → "Complete Stop".

### 4. All-stops overview (sheet)
Opened from the progress pill. "Today's Route" title + a scrollable list of every stop: number badge, name, address, and either a status word ("Done" / "On site" / "Flagged") or drop/pick arrow icons. Tapping a row targets that stop on the map and closes the sheet. **Lets the driver jump ahead/back** without forcing strict order.

### 5. Problem sheet
Bottom sheet with reasons: "Gate code didn't work", "Nobody home", "Couldn't access property", "Wrong address", "Other issue". Selecting one flags the stop (`status: skipped`/a new `problem` state) and notifies dispatch, then advances to the next stop.

### 6. Route complete
When no pending/arrived stops remain, the sheet shows a green check, "Route Complete", "All N stops done — head back to the shop."

---

## Interactions & Behavior

- **Slide-to-arrive (chosen interaction):** a draggable knob inside a track labelled "Slide to arrive". On release past ~82% it commits → `updateStopStatus(id, 'arrived')`, auto-expands the sheet, and **auto-texts** the customer "On our way". Implement as a pointer/touch drag (the prototype handles mouse + touch). This was chosen over a plain tap button for deliberateness on a phone in a moving van.
- **Navigate → Google Maps:** opens
  `https://www.google.com/maps/dir/?api=1&destination=<encodeURIComponent(address + ", " + town)>`
  in a new tab. If `customer.lat`/`lng` exist, prefer `destination=<lat>,<lng>` for accuracy. (Your `StopDetail.tsx` already builds a `maps.google.com/?q=` URL — switch it to the `dir/?api=1` directions form.)
- **Auto-text customer:** call `sendSms()` automatically inside the `arrived` and `completed` transitions (server-side, in `updateStopStatus`), rather than the current manual SMS UI. Messages: arrive → "Hi! Your Sweetwater's delivery is on the way." / complete → "Your Sweetwater's delivery is complete." Keep a manual resend affordance if desired.
- **Photo-required:** "Complete Stop" is **disabled** until at least one photo is uploaded for the stop (and the applicable drop/pick rows are confirmed). Helper text reads "Snap a photo to finish." This is configurable in the prototype (Tweaks → "Photo required") but the owner wants it **ON**.
- **Offline-first (Hamptons signal):** the sync chip reflects connectivity; status changes (arrive/complete/photo) must **queue locally and sync when back online**. The prototype only *simulates* this (a toggle + a queued counter). Real implementation: optimistic local state (already a project convention) + a queue persisted in IndexedDB and a service worker / background sync, flushing the queued mutations and SMS when `navigator.onLine` returns true. Photos should upload from the queue too.
- **Optimistic UI:** update local state before the server confirms (existing project convention), revert on error.

## State Management
Per active route (already available from the `routes` + `route_stops` + `customers` + `stop_photos` query in `app/driver/page.tsx`):
- `targetId` — which stop is focused in the sheet/map (defaults to first pending).
- `sheetState` — `'peek' | 'full'`.
- `overviewOpen` — boolean (all-stops sheet).
- `problemFor` — stop being flagged, or null.
- `online` / `queuedCount` — connectivity + pending offline mutations.
- Per-stop server state (existing): `status` (`pending|arrived|completed|skipped`), `dropoff_confirmed`, `pickup_confirmed`, `photos`.

## Design Tokens
All already defined in `tailwind.config.ts`:
- **Colors:** green `#02733e` (dark `#015a30`, light `#028a4a`); gold `#d59a29` (light `#e8b84b`, dark `#b8821f`); cream `#FAF7F2` (dark `#F0EBE1`); charcoal `#1A1A1A`. Accent options shown in Tweaks: `#02733e` / `#0c6b5f` / `#1f4d2e` (keep green unless you want a deeper tone).
- **Fonts:** serif = "Cormorant Garamond" (names, wordmark); body/UI = "Jost" (loaded in `globals.css`).
- **Type:** customer name 24px serif/500; body 13.5–15px; uppercase UI labels 11–13px with `letter-spacing: 0.14–0.22em`.
- **Radii:** sheets/cards 13–26px; buttons 15–16px; pills 999px.
- **Tap targets:** min 44px (existing `min-h-tap`); primary buttons 54–62px tall.
- **Shadows:** sheet `0 -10px 40px rgba(0,0,0,0.16)`; floating chrome `0 6px 20px rgba(0,0,0,0.12)`.

## The Map
The prototype's map is a **stylized CSS/SVG placeholder** (`StreetMap` in `design_files/app/sw-data.jsx`) — faux roads, parks, an ocean band, and percentage-positioned pins. **For production, swap in a real map** (Mapbox GL via `react-map-gl`, MapLibre, or Google Maps JS). `customers` already has `lat`/`lng` columns — use them for pin placement, the route polyline, and the live driver dot (you already have `LocationTracker.tsx` + a `driver_locations` table). Keep the visual treatment: numbered teardrop pins (green/gold/done), dashed green route line, blue current-location dot.

## Assets
- **Icons:** simple single-stroke line icons drawn inline (phone, navigation arrow, pin, camera, check, chevron, key, cloud, route, alert, etc.) — see the `Icon` component in `sw-data.jsx`. Replace with your preferred icon set (e.g. Lucide) or port these.
- **Photos:** delivery photos are user-captured at runtime via `PhotoCapture.tsx` / `/api/photo`; the prototype shows a striped placeholder.
- No external image assets.

## Files (in `design_files/`)
- `Sweetwater Driver — Map.html` — the runnable prototype entry (open in a browser).
- `app/driver-map.jsx` — **the Direction B screen** (map home, bottom sheet, overview, slide-to-arrive, offline). Primary reference.
- `app/sw-data.jsx` — brand theme, `Icon` set, mock route data, `StreetMap`, `Pin`, `mapsHref` (Google Maps helper).
- `app/driver-clean.jsx` — shared UI primitives (`Label`, `BigButton`, `TaskBadge`, `PhotoThumb`, `CheckRow`, `NumBadge`, `ProblemSheet`, `Toast`) + the alternate "Direction A" list flow for reference.
- `ios-frame.jsx` — device bezel used only to present the prototype (not needed in production).
- `tweaks-panel.jsx` — prototype-only controls (not needed in production).
```
```
