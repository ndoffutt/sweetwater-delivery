# Sweetwater Delivery — UX Review (2026-06-23)

Tested 20 end-to-end flows on **https://sweetwater-delivery-staging.vercel.app**
(staging clone of prod, logged in as Nate · admin). Desktop viewport.

Findings are ranked: **🚨 Critical** (broken or blocking) → **⚠️ High** (significant
UX cost) → **📋 Medium** (polish). Each one points at the affected file/route.

---

## Flows covered

| # | Flow | URL | Result |
|---|---|---|---|
| 1 | Owner home | `/owner` | ✓ activity feed dedupe working |
| 2 | Dispatch today | `/dispatch` | ⚠ title-overlap bug |
| 3 | Customers list | `/dispatch/customers` | ⚠ wasted right pane |
| 4 | Customer detail | `/dispatch/customers` → click | ⚠ tag state unclear |
| 5 | Messages | `/dispatch/messages` | ⚠ empty state |
| 6 | History | `/dispatch/history` | 🚨 proof photos broken |
| 7 | Driver map | `/driver` | 🚨 map tiles not loading |
| 8 | Prospects list | `/sales` | ✓ |
| 9 | Prospect detail | `/sales` → click | ⚠ touch buttons cramped |
| 10 | Settings | `/settings` | ⚠ very thin |
| 11 | Scan | `/dispatch/scan` | 🚨 **blank page** |
| 12 | Signups | `/dispatch/signups` | ⚠ empty state |
| 13 | Reports | `/dispatch/reports` | ⚠ "0 items" everywhere |
| 14 | Public signup | `/signup` | ✓ |
| 15 | Add Prospect | `/sales` → +Add | ⚠ inconsistent pattern |
| 16 | Add Customer | `/dispatch/customers` → +Add | ⚠ inline vs modal |
| 17 | Live tracking | `/dispatch/live` | ⚠ empty state |
| 18 | Route detail | `/dispatch/route/[id]` | 🚨 contradictory state |
| 19 | Delivery detail | `/dispatch/delivery/[id]` | ⚠ proof empty, phone unformatted |
| 20 | Customer track | `/track/[token]` | ⚠ no CTA on invalid token |

---

## 🚨 Critical

### 1. `/dispatch/scan` renders an empty page
Navigated to `/dispatch/scan` — **no title, no instructions, no UI at all**. Just
the side nav and an empty cream content area. Either the page is broken or
designed for mobile-only camera scan — but it should at least say so.
Fix: detect non-camera environment and show "Open this on your phone to scan
manifests" + maybe a QR to the page. File: `app/dispatch/scan/page.tsx`.

### 2. Proof-of-delivery photos broken on History page
The `<img>` tags with `alt="proof"` show as broken-image icons under every stop
in `/dispatch/history`. Image URLs likely point at the prod Supabase Storage
bucket (or a public-URL prefix that's wrong on staging). Either way, **broken
on every history row** — customers/owners can't verify proof.
File: `app/dispatch/history/page.tsx`. Suspect a hardcoded
`SUPABASE_URL`/bucket prefix not picking up env.

### 3. Driver map tiles not loading
`/driver` shows a grey background with floating numbered markers (1–11) but **no
map underneath**. Mapbox style not loading on staging — likely a Mapbox token
issue (token restricted to prod domain). The route is otherwise unusable.
Check: `NEXT_PUBLIC_MAPBOX_TOKEN` on Vercel staging, plus the token's allowed
URL list at Mapbox account settings.

### 4. Route detail: first stop has no number circle
On `/dispatch/route/[id]`, every stop shows a numbered circle (2, 3, 4…) **except
stop #1**, which only shows a checkmark and no number. Looks like a CSS/render
bug where the number is hidden when status=completed AND order=1. The other
completed stops keep both their checkmark and number, so it's stop-specific.
File: route-stops list component.

### 5. Stops show "skipped" pill while text says "Delivered HH:MM"
Same view as above — stop 2 (Shirin Kaufman) and stop 3 (Loewe) both display:
- right-side pill: `skipped`
- middle text: `Delivered 8:48 AM` / `Delivered 9:00 AM`
These contradict each other. Customer-facing, this is hot — Tara can't tell
whether stop was actually done. Resolve the rule (delivered_at set vs status)
and pick **one** truth source.

---

## ⚠️ High

### 6. "Welcome back, Nate" pill overlaps "Today's Dispatch" title
On `/dispatch`, a green pill labeled "Welcome back, Nate" sits **directly on top
of** the page heading. Looks like absolute-positioned greeting that should be in
the top-right toolbar. Bad enough that the title is unreadable at the overlap.

### 7. Inconsistent add pattern (modal vs inline)
- `+ Add` on Prospects → opens centered modal overlay
- `+ Add` on Customers → renders inline form in right pane
Pick one. Modal is better here because Customer list is the work surface, not
the form. (Bonus: the Customer form has no email field but the Prospect form
does.)

### 8. Phone numbers unformatted and not tappable
Customer + delivery detail show raw `6319079270`. Should be `(631) 907-9270`
and wrapped in `<a href="tel:…">` so the dispatcher can tap-to-call. Same on
customer detail and prospect detail.

### 9. Drop-off / Pickup buttons identical
On `/dispatch/delivery/[id]`, the two giant green buttons "★ DROP-OFF" and
"★ PICKUP" look identical. No state for "this stop is drop-off only" vs "both"
vs "neither done". On a busy route the driver/dispatcher can't tell which
applies. Use:
- chip/badge on the stop saying what's needed
- green-filled for done, outlined for pending
- gray-disabled for not applicable

### 10. "Sign Out" is invisible
Bottom-left of the side nav: small grey "Nate / SIGN OUT" text, looks like a
caption, not a control. Move to a small icon button or wrap in a card.

### 11. Empty states have no next action
Messages: "No conversations yet" — fine, but no link to "test your office
number" or anything.
Live: "No route is out for delivery today." — link to `/dispatch` to dispatch
one.
Signups: "No new signups right now" — link to public signup form or share the
URL.

### 12. Reports: "0 ITEMS" everywhere is confusing
`/dispatch/reports` shows "Items delivered per week" all zeros for every week.
Either remove the section (no items being tracked yet) or label it
"Coming soon — once item counts are filled in on delivery". Currently looks
broken.

---

## 📋 Medium

### 13. Tag chips don't show selected state
Customer detail "TAGS" row: VIP / Year-round / Seasonal / Commercial — all the
same style. Can't tell which (if any) is set. Selected chip should be filled
green or have a checkmark.

### 14. Unlabeled date in customer list cards
Each customer row shows "Jun 18" / "May 28" on the right with no caption. Last
delivery? Last edited? Added? Add a tiny "LAST DROP" label or icon.

### 15. Customer list cards underused
Cards are name + address + that mystery date. With ~280px to play with, could
also surface: delivery day chip (M/W/Th), tag pill, phone, route position.

### 16. "Sort: Name" looks static, not interactive
On the customer list, "SORT: NAME" is small grey text — looks like a heading.
Make it a dropdown or chip-set like Prospects does (Priority / Town / A–Z / Last
touch). And mirror this on Customers.

### 17. "Log a Touch" row of 6 buttons is cramped
Prospect detail has 6 actions side-by-side (Visit / Delivery / Call / Email /
Text / Note) at ~70px each. Hard to tap, labels are tiny. Stack as 2x3 grid or
3x2 — gives 100px+ tap targets.

### 18. Cancel buttons too subtle
"+ ADD PROSPECT" modal: big green CTA, "CANCEL" as plain grey text. Easy to
miss when you want to bail. Make Cancel a bordered button so it reads as
"clickable thing".

### 19. Right pane empty until selection
Customers, Messages, Prospects all show "Select a customer/conversation/
prospect" on desktop. Wasted real estate. Drop in:
- recent activity for that section
- quick stats ("you have 12 prospects overdue")
- empty illustration

### 20. "Other" pre-selected as prospect type
Add Prospect modal defaults `Other` selected. Either no default, or default to
the most-common type. "Other" as default trains users to ignore the type field.

### 21. Track page (invalid token) gives customer no out
`/track/abc-bad-token` says "This tracking link isn't valid anymore" — no phone,
no email, no "contact us" link. Customer's only option is to close the tab.

### 22. Settings page is very thin
Only Notifications + Team. Surprising for an ops app — would expect: office
phone number config, message templates (delivery sent / arriving / completed),
hours of operation, route times, billing/Stripe link, customer SMS opt-in
defaults, photo retention policy.

---

## What's working well

- **Activity feed dedupe is in effect** ✓ (the fix from `lib/activity.ts` — no
  more "Hedges Inn" twice)
- **Prospects pipeline UI is strong** — tab counts, overdue callout, type/status
  chips, the "12 overdue · pinned to top" banner is exactly the right pattern
- **Customer detail "Delivery Days" with M/W/Th + route name** below each day is
  a great compact UI
- **Mega Drop-off / Pickup buttons** on the delivery screen — right size for
  driver hands (just need to differentiate state)
- **Stops/week chart on Reports** — clean, week-over-week highlights current
- **Public signup form** — solid copy, proper SMS consent block, clean layout

---

## Top 5 to fix first

If you do nothing else from this list, do these:

1. **Fix `/dispatch/scan` empty page** — looks broken
2. **Fix history proof photos** — biggest customer-trust regression
3. **Fix Mapbox token for staging** so driver map tiles load
4. **Resolve "skipped + Delivered HH:MM" contradiction** on Route detail
5. **Fix "Welcome back, Nate" overlap** on Dispatch home

After that, the "High" items (#6–#12) — pattern consistency, phone formatting,
button differentiation — give the biggest UX lift per hour invested.
