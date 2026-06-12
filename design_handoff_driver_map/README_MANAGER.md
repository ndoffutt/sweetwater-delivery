# Handoff: Manager / Dispatch Console

## Overview
This is the **manager-facing** side of Sweetwater's Delivery App — the desktop-and-phone console the shop uses to build the day's route, manage the customer directory, and review delivery history. It is the counterpart to the driver flow (see `README.md`). Both share one brand, one map treatment, and the same Supabase data.

It is built around one real workflow the owner described: **a delivery manifest is exported/printed from SPOT (the dry-cleaning POS), photographed, and read by Claude** to build the route. The parsing pipeline already exists in the codebase at **`lib/manifest/extract.ts`** — this design wraps a UI around it.

## About the Design Files
The files in `design_files/` are **HTML/React (Babel-in-browser) prototypes** demonstrating look, layout, and behavior — **not production code to copy**. Recreate them inside the existing Next.js + TypeScript + Tailwind + Supabase codebase, reusing `lib/actions/*`, `lib/types.ts`, and the `tailwind.config.ts` theme. The prototypes use inline styles and a mock data file (`mgr-data.jsx`); use Tailwind classes and real Supabase data in production.

## Fidelity
**High-fidelity** for layout, type, color, spacing, and interactions. The **map** is a stylized CSS/SVG placeholder (`StreetMap` in `design_files/app/sw-data.jsx`) — swap for a real map (Mapbox/MapLibre/Google) using the `latitude`/`longitude` already present in the SPOT export / `customers` table. Photo thumbnails are striped placeholders; real ones come from `stop_photos`.

## Responsive
The shell is **responsive**: desktop gets a left sidebar; phone gets a top bar + bottom tab bar. The prototype's "Desktop / Phone" toggle at the top is a **demo affordance only** — in production this is one responsive layout (`MgrShell` with an `isMobile` breakpoint, e.g. Tailwind `md:`). Don't build two apps.

---

## Sections (left nav)

### 1. Dispatch — `app/(manager)/dispatch` (new)
The core screen. Three phases:

**a. Scan (empty state).** Three entry points — **Take photo**, **Choose photo**, **Choose file** — because SPOT manifests arrive as photos of printed sheets (and sometimes a PDF/CSV export). All three feed the same handler.
- Take photo / Choose photo → `<input type="file" accept="image/*" capture="environment">` → base64 → **`extractManifestStops(base64, mediaType)`** in `lib/manifest/extract.ts` (already implemented: Claude vision → `{stop_order, customer_name, address, phone, has_dropoff, has_pickup, notes}[]`).
- Choose file → accept image/PDF/CSV. For CSV (the `delivery_route.csv` shape: `stop_order,name,address,city,state,zip,full_address,phone,customer_id,tender,account_type,latitude,longitude`), parse directly — no vision needed.
- The empty state also shows the **last scanned manifest** (thumbnail of the sheet + "what Claude pulled from it" preview).

**b. Reading (loading).** While `extractManifestStops` runs, show progress: "Manifest photo received → Read N stops from the SPOT sheet → Matched to customer accounts → Flagging drop-offs, pick-ups & on-demand → Ordering the run." Matching = fuzzy-match each `customer_name`/`address` to an existing `customers` row (create a row if new).

**c. Review & send.** The built route renders as an ordered, **drag-to-reorder** list (each stop shows # / name / address / Drop-off + Pick-up chips / VIP star / remove). A summary strip (Stops / Drop-offs / Pick-ups / Driver), a route map with numbered pins + polyline, an **Assign** control (one driver/van for now — "Marcus · Van 1"), and **Send route to Marcus**. Sending writes a `routes` row (status `dispatched`) with ordered `route_stops`, which the driver app already consumes. After sending, the card flips to a "Route dispatched" confirmation with an "Edit route" affordance.

SPOT → drop/pick rules (already encoded in `extract.ts`'s system prompt): **on-demand stops are pickup-only**; delivery stops with invoices are drop-offs. Respect `has_dropoff`/`has_pickup` from the extractor — do not infer client-side.

### 2. Customers — `app/(manager)/customers` (new)
Searchable, filterable (**All / VIP / Seasonal / Commercial**) directory backed by `customers`. List → detail (master-detail on desktop, drill-in on phone). Detail shows **address, phone (tap-to-call), gate/entry code, last delivered**, **editable standing notes**, tags, and recent activity (with photo proof).

> **Data note:** SPOT only provides name / address / phone / pieces / account. **Gate codes, tags, and standing notes are Sweetwater's own fields** — not in the manifest. They live on the `customers` table, are edited here by the manager, and — per the owner — are **also editable by the driver from the road** (the driver app's stop sheet should expose a notes editor that writes back to `customers.notes`). The SPOT `account_type`/`tender` (e.g. `Delivery` vs `A/R`) can drive a small badge.

### 3. History — `app/(manager)/history` (new)
List of completed `routes`, each expandable to a **per-stop timeline** with **arrived → completed timestamps**, drop-off/pick-up confirmation, and a **photo thumbnail** (click to enlarge). Flagged/skipped stops show their reason. "Export day (PDF)" per route. All data already exists: `route_stops.status`, arrival/completion timestamps, `dropoff_confirmed`/`pickup_confirmed`, `stop_photos`.

### 4. Live — `app/(manager)/live` (new)
Real-time view of the active route: driver position on the map (from `driver_locations` / `LocationTracker.tsx`, via Supabase Realtime), a "currently at" card, and a route-progress list with completion times. "Call driver" (`tel:`).

### 5. Reports — `app/(manager)/reports` (new)
Lightweight weekly summary: **Stops this week**, **Photos captured**, **Flagged stops**; a **Stops-per-week** bar chart (last 5 weeks); **busiest customers**; **by-town** breakdown. (On-time rate intentionally omitted.) All derivable from `routes` + `route_stops`. Numbers in the prototype are illustrative — confirm which metrics matter before building.

---

## How this maps to existing code

| Prototype piece | Existing code to use | Notes |
|---|---|---|
| Manifest scan | **`lib/manifest/extract.ts`** (`extractManifestStops`) | Already built — Claude vision → structured stops. Wire the 3 upload buttons to it. |
| CSV import path | `delivery_route.csv` columns | Parse directly when a CSV is chosen; geocode already present (`latitude`/`longitude`). |
| Build & send route | `routes`, `route_stops` tables + existing route actions | Dispatch writes the same shape the driver app reads. |
| Customer directory + edit notes | `customers` table | Add `notes`, `gate_code`, `tags`, `last_delivered` if not present. Editable by manager **and** driver. |
| History timeline | `route_stops` (timestamps, confirmations) + `stop_photos` | Read-only. |
| Live tracking | `driver_locations` + `LocationTracker.tsx` + Supabase Realtime | Reuse the driver location pipeline. |
| Brand / theme | `tailwind.config.ts`, `globals.css` | green `#02733e`, gold `#d59a29`, cream `#FAF7F2`, charcoal `#1A1A1A`; Cormorant Garamond (serif) + Jost (UI). |

## Design Tokens
Same as the driver flow (already in `tailwind.config.ts`): green `#02733e` / dark `#015a30` / light `#028a4a`; gold `#d59a29` / light `#e8b84b` / dark `#b8821f`; cream `#FAF7F2` / dark `#F0EBE1`; charcoal `#1A1A1A`. Serif = Cormorant Garamond (headings, names, wordmark); UI = Jost. Uppercase micro-labels use `letter-spacing: 0.14–0.22em`. Cards radius 14–16px; sidebar is solid green; tap targets ≥44px.

## Files (in `design_files/`)
- `Sweetwater Manager Console.html` — runnable prototype entry (open in a browser; toggle Desktop/Phone).
- `app/mgr-data.jsx` — **real SPOT customer data**, today's route, route history, extended icon set. The customer list mirrors your `delivery_route.csv`.
- `app/mgr-shell.jsx` — responsive shell (sidebar + bottom tabs) and shared UI bits (`MCard`, `Tag`, `Avatar`, `SectionTitle`, `TaskDot`).
- `app/mgr-dispatch.jsx` — the scan → review → send flow.
- `app/mgr-customers.jsx` — directory + detail + editable notes.
- `app/mgr-history.jsx` — route history with timestamps + photo proof.
- `app/mgr-extra.jsx` — Live tracking + Reports.
- `app/sw-data.jsx` — shared brand theme, `StreetMap` (placeholder map), `Pin`. Shared with the driver flow.

See `README.md` for the **driver flow** brief; the two are one app and should share components, theme, and Supabase data.

---

## Reference screenshots (`screenshots/`)
Visual targets — match these closely. (Map is a placeholder; swap for a real map.)

**Driver flow**
- `driver-01-start.png` — Start screen (tap to begin route)
- `driver-02-map.png` — Map home with the active stop in a peek bottom sheet
- `driver-03-stop-detail.png` — Expanded stop sheet: notes, tap-to-call, slide-to-arrive

**Manager console**
- `manager-01-dispatch-scan.png` — Dispatch empty state: Take photo / Choose photo / Choose file + last-scanned preview
- `manager-02-dispatch-review.png` — Route built from the SPOT scan: drag-reorder, summary, map, assign & send
- `manager-03-customers.png` — Customer directory + detail with editable standing notes
- `manager-04-history.png` — Route history with per-stop arrived→completed timestamps + photo proof
- `manager-05-live.png` — Live driver tracking
- `manager-06-reports.png` — Weekly reports (stops/week, photos, flagged, by town)
- `manager-07-phone.png` — Responsive phone layout (one app, not two)
