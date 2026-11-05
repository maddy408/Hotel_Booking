# Analysis of the prototype — Tamarind Court Front Desk

Source: `Tamarind Court Front Desk.html` (single-file vanilla-JS app, state in `localStorage`, reseeded every calendar day). This document is the contract for what the production system must preserve, and the list of gaps production must close.

## 1. Screens (tabs)

| Tab | Purpose |
|---|---|
| **Rooms** | Home screen. Status counters (Free/Booked/Occupied/Cleaning/Repair) that double as filters, floor-grouped room-tile rack, "Direct Check-in" and "New Booking" actions. Tapping a tile opens the context-appropriate popup. |
| **Bookings** | List of all future/pending bookings grouped into *Not came (date passed)*, *Today*, *Tomorrow*, *Later*. Each row can be opened or, if the room is ready and the date has arrived, checked in directly. |
| **Guests** | Searchable guest directory (name/phone/city) with visit count, lifetime paid, and current status (in a room / booked / none). Opens a guest profile with stay history. |
| **Bills** | Today's checkout summary (count, billed total, advance collected today) + full historical bill list. |
| **Room Master** | Hotel name/place, room types & rates (add/edit/delete, rate change does not retroactively change rates for a current stay), rooms (bulk add by range, per-room type change, two-tap delete guarded by live stay/booking). |

Production adds, per the brief: **Login**, **Bills/Invoices** (proper GST invoice, not just a list), **Reports**, **Users**, **Settings** — none exist in the prototype.

## 2. Core user flows

1. **Direct check-in (walk-in):** tap a free room (or "Direct Check-in" → pick from a free-room picker grouped by type) → fill phone/name/ID/persons/days/rate/advance → live bill preview (room × days + GST − advance = balance) → confirm → room becomes Occupied.
2. **New booking (phone/future):** "New Booking" → phone (auto-matches an existing guest) → name → arrival date → days → persons → room type filter → pick from rooms that are free for the *whole* requested range → rate (defaults from type, editable) → advance + method → confirm → room shows **Booked** (yellow) once the arrival date is today or earlier, otherwise stays whatever it already is.
3. **Booking arrival ("guest came"):** from a Booked tile, the Bookings list, or the guest profile → "Guest came · Check in" reuses the same stay record (so the booking code/advance survive) but **resets the actual check-in date to today** and recomputes the checkout date from "days", not from the original booking's `out`.
4. **Checkout:** tap an Occupied tile → bill recomputed live (days stayed so far × rate + GST + extras − advance) → optionally add extra charges (Food/Laundry/Extra bed/Taxi/Other, no GST applied to extras in the prototype) → pick payment method → two-tap confirm ("Collect ₹X by UPI?" → Yes) → stay marked `done`, `outOn = today`, room flips to Cleaning.
5. **Extend stay:** one tap from the checkout sheet, pushes `out` one day later than `max(current out, today)` — guards against extending from a stale past date.
6. **Housekeeping:** Cleaning room → "Room is ready" (→ Free) or "Send for repair" (with a note). Repair room → "Repair done, send for cleaning" (→ Cleaning, never straight to Free — forces a cleaning pass after any repair).
7. **Booking edit/cancel:** from the booking detail sheet, "Change dates/room" re-opens the booking form pre-filled; "Cancel booking" needs a second confirming tap; cancellation only flags `cancelled: true` (no refund workflow).
8. **Room Master maintenance:** add a room type; edit a type's name/rate/max persons (existing stays keep their already-copied rate — rate is copied onto the stay at creation, not referenced live); delete a type only if no room uses it; bulk-add rooms by floor + numeric range (≤60 at a time); delete a single room only if it has no live stay/booking, via a two-tap "armed" delete.

## 3. Entities (as implicitly modeled by the prototype's single `DB` object)

| Entity | Prototype shape | Notes |
|---|---|---|
| `hotel` | `{name, place}` | Singleton. GST slab table and 12-noon rule are hardcoded in JS, not configurable. |
| `types` (room type) | `key → {name, rate, max}` | Key is a short code (`STD`,`DLX`,...) or `T<timestamp36>` for user-added types. Rate is "current" rate; a stay snapshots its own `rate` at creation time. |
| `rooms` | `{no, floor, type, hk, note}` | `no` is globally unique (used as the lookup key — no numeric id). `hk` ∈ `ok/cleaning/repair`; "occupied"/"booked" are *derived*, not stored. |
| `guests` | `{id, name, phone, idType, idLast, city}` | **Only the last 4 digits of the ID are stored** — full number is never kept. `id` is `'G' + (101 + arrayLength)` — collision-prone, must become a real surrogate key. |
| `stays` | `{id, bk?, room, guestId, in, out, persons, rate, advance, pay, extras[], done, booked?, cancelled?, outOn?, paidBy?, madeOn}` | **One table does triple duty**: an upcoming booking (`booked:true`), an in-house stay (`booked:false/undefined`, `done:false`), and a finished stay / bill (`done:true`). `bk` (booking code `BK-<id+1000>`) only exists if the stay was ever a booking. `extras` is an inline array of `{l,a}` (label, amount) — no per-extra id, timestamp, or who-added-it. |

No `payments`, `invoices`, `housekeeping_logs`, `users`, `roles`, or `audit_logs` exist — the prototype has no auth, no multi-payment history, no invoice numbering, and no audit trail at all.

## 4. Business rules to preserve exactly

- **Room status derivation (priority order, first match wins):**
  `occupied` (a live, non-booked stay in the room) → `cleaning` (`hk==='cleaning'`) → `repair` (`hk==='repair'`) → `booked` (a live booking with `in <= today`) → `free`.
  A room can simultaneously have a future booking *and* show `cleaning`/`occupied` for today — the booking only surfaces once nothing else overrides it.
- **Overlap / availability check** (`roomFree(no, a, b, ignoreId)`): a room is unavailable for `[a, b)` if any *live* (`!done && !cancelled`) stay in that room satisfies `s.in < b && a < effectiveOut(s)`, where `effectiveOut = s.booked ? s.out : (s.out > today ? s.out : today + 1)`. The `+1` clause means an **overstaying in-house guest** (planned checkout already in the past) blocks the room through *at least* tomorrow, even though their stored `out` is stale. This is a half-open interval, so a checkout today and a new arrival today do not conflict (12-noon turnover).
- **GST slabs by nightly rate** (`gstRate`): `rate ≤ 1000 → 0%`, `rate ≤ 7500 → 5%`, `rate > 7500 → 18%`. Applied **only to the room amount**, using the stay's own snapshotted `rate` — never the type's current rate, and **never applied to extras** in the prototype (a deliberate simplification the brief asks us to make *configurable* in production, not necessarily to keep).
- **Nights calculation** (`days(a,b)`): `max(1, round((b-a)/day))` — always at least 1 night, even for a same-day in/out.
- **12-noon checkout**: UI-only label ("Leaves {date}, 12 noon") — never enforced as a time cutoff anywhere in the logic. Production should keep it as a display convention tied to the configured checkout hour, not a hard runtime rule (midnight-based date math stays as-is).
- **Check-in from a booking is not the booking's own date**: converting a booking to a stay always sets `in = today` (even if the booking's `in` was in the past — e.g. a "not came" booking that finally shows up) and derives `out = today + days`, discarding the booking's original `out`. The booking's `advance`/`pay` carry over unchanged.
- **Checkout always stamps `outOn = today`**, regardless of the planned `out` — covers both early checkout and overstay; `paidBy` is the method chosen at that moment, independent of the advance's original method.
- **Extend**: `out = addDays(max(out, today), 1)`.
- **Advance / balance**: `balance = total − advance`; a negative balance means a refund is owed at checkout (the UI flips "Collect" to "Give back"). Overpaid advances (seen in seed data, e.g. room 110's ₹17,000 advance) are a real, supported case, not a bug.
- **Room type delete** is blocked while any room references it; **room delete** is blocked while any live (non-cancelled, non-done) stay or booking references that room number — both must become server-side-enforced FK/integrity rules, not just UI guards.
- **Guest de-duplication by phone**: typing a complete 10-digit number during check-in/booking auto-matches an existing guest and locks `name`/`idType`/`city` to that guest's record (editable, but attributed to the same guest id) rather than creating a duplicate.
- **ID masking**: Aadhaar → `XXXX XXXX <last4>`; everything else → `••••<last4>`. Today only the last 4 digits exist at all; production must store the full number **encrypted at rest** and derive the same masked display from it, never store only a truncated value.

## 5. Gaps the prototype leaves for production to close

1. **No auth, no roles** — anyone with the browser can do anything. Production needs login, JWT/session, and per-endpoint role checks (admin/manager/receptionist/housekeeping).
2. **No concurrency safety** — all checks run against an in-memory array in one browser tab. Two front-desk tabs/devices could double-book the same room. Production must do the overlap check **inside a DB transaction with row locks** on the candidate room(s).
3. **IDs are client-generated and collision-prone** (`'G'+(101+guests.length)`, `DB.seq++`, `'BK-'+(1000+id)`). Production uses DB auto-increment plus a separate formatted code (booking code, invoice number) generated server-side, never derived from array length.
4. **Only last-4 of ID proof is stored**, never the full number. Production stores the full ID number encrypted (e.g. `AES-256-GCM` at the app layer or MySQL `AES_ENCRYPT`), decrypts only server-side for authorized display/printing needs (e.g. Form C), and reuses the same masking rule for the UI.
5. **No foreign-guest fields** (nationality, passport, visa details) needed for Form C — net-new fields on `guests`/`stays`.
6. **No multiple payments / partial payments** — only one `advance` amount+method and one checkout payment. Production needs a `payments` table supporting several payments per stay (advance top-ups, split checkout payment, refunds), each with its own method/timestamp/recorded-by.
7. **No real invoice** — "Bills" is just a filtered list of finished stays computed on the fly; there's no sequential GST invoice number (per financial year), no GSTIN capture, no CGST/SGST/IGST split, nothing printable. Production needs an `invoices` table with a unique running number per financial year and a printable HTML/PDF.
8. **GST is hardcoded**, not configurable, and never applied to extras. Production must read slabs (and whether extras are taxed) from `settings`.
9. **No cancellation refund record, no no-show workflow** beyond a `cancelled` flag and a "Not came" grouping — no explicit no-show status, no refund transaction tied to a cancelled booking's advance.
10. **No audit trail** — check-in, checkout, cancel, rate change, room delete all mutate state silently. Production logs each to `audit_logs` (who/when/what/before→after).
11. **No reports** beyond the single "Today" tally on the Bills screen — no day-end cash/UPI/card split, no occupancy %, no revenue-by-range, no CSV export.
12. **No ID image upload**, no users/roles screen, no settings screen — all net-new.
13. **Demo-only persistence**: `localStorage`, keyed by day, reseeded every calendar day (`DB.day === TODAY` check) and a one-tap-armed "Reset demo data" button. Production replaces this entirely with a real MySQL database and a proper one-time `seed.sql` (used for local dev only, not reset in production).
14. **Extras have no identity** — `{l,a}` pairs with no id/timestamp/author, can't be individually audited, only removed by array index from the currently-open sheet. Production gives each extra (`stay_charges` row) its own id, timestamp, and the user who added it.

## 6. UX/visual contract to preserve

- **Interaction model**: tap a room tile → one popup (centered modal ≥560px wide on desktop, bottom sheet on mobile) whose content depends on current room state — free→check-in form, occupied→checkout form, booked→booking detail, cleaning→"mark ready / send to repair", repair→"send to cleaning". This popup pattern is the single way every room-level action happens and must not be replaced by separate pages.
- Status counters double as toggleable filters; a floor-grouped tile rack; color-coded status (`free`=green, `occupied`=blue, `cleaning`=purple, `repair`=red, `booked`=amber/orange) via CSS custom properties, with full light/dark themes (`prefers-color-scheme` + manual `data-theme` override).
- Typography: display font **Bricolage Grotesque**, body **Figtree**, numeric/mono **JetBrains Mono** (tabular figures for all money/counts).
- Bottom-sheet pattern on narrow viewports (`max-width:560px`), Esc key and scrim-click both close the open sheet, toast notifications for confirmations, two-tap "armed" pattern for destructive actions (delete room, reset data, cancel booking).
- Live bill preview recalculates on every keystroke in the check-in/booking forms (debounced only by focus-preserving re-render, not by time).
- Design tokens are CSS variables (`--bg,--surface,--ink,--muted,--line,--accent,--ok/--occ/--cln/--bk/--mnt` + their `-bg` pairs) — production should port these 1:1 as the frontend's design-token source, not re-invent a new palette.

This analysis is the baseline for [PLAN.md](PLAN.md).
