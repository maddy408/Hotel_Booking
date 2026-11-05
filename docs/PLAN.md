# Build plan — Tamarind Court Front Desk

Baseline: [ANALYSIS.md](ANALYSIS.md). Stack is fixed by the brief (React+Vite frontend, PHP 8 layered backend on XAMPP/Apache, MySQL/InnoDB). Project root: `C:\xampp\htdocs\tamarind-court\` (`frontend/`, `backend/`, `database/`, `docs/`). Phases run sequentially without stopping for approval; each ends with a short summary + what's next, per the brief.

## Phase 1 — Analysis + DB schema
- `docs/ANALYSIS.md`, `docs/PLAN.md` (this file).
- `database/schema.sql`: `hotels`, `settings`, `roles`, `users`, `room_types`, `rooms`, `guests`, `reservations` (bookings), `stays` (check-ins), `stay_charges` (extras), `payments`, `invoices`, `housekeeping_logs`, `audit_logs`. InnoDB, utf8mb4, FKs, indexes on room number / phone / dates, unique constraints on room number and invoice number (per financial year).
- `database/seed.sql`: hotel + settings (GST slabs, checkout hour), 4 room types, 40 rooms across 4 floors, ~19 guests, a spread of finished/in-house/booked stays mirroring the prototype's seed, 3 users (admin/manager/receptionist/housekeeping logins).
- Verify: `mysql < schema.sql < seed.sql` runs clean; `SHOW TABLES`/`SHOW CREATE TABLE` spot-checked.

## Phase 2 — Backend core + auth
- Composer project (`backend/composer.json`, PSR-4 autoload), layered folders: `src/Router`, `src/Controller`, `src/Service`, `src/Repository`, `src/Middleware`, `src/Support` (JSON envelope, validation, errors), `public/index.php` front controller, `.htaccess` rewrite, `backend/.env.example`.
- Central error handler → `{success:false, error:{code,message,fields?}}`; success envelope `{success:true, data}`.
- `users`/`roles` repository + service; `password_hash`/`password_verify`; login endpoint issuing JWT access + refresh tokens (HS256, short-lived access / longer refresh, rotated); login rate limiting (per IP+username, DB-backed counter); `AuthMiddleware` resolving the bearer token to a user+role; `RoleMiddleware` for per-route permission checks.
- CORS config (allow the Vite dev origin, configurable).
- Verify: `php -l` on every file; `curl` smoke test of login (success + bad password + rate-limited) returning the right envelope/status codes.

## Phase 3 — Rooms / Room Master APIs
- `room_types` and `rooms` CRUD, mirroring the Master screen's rules server-side: delete type blocked if rooms reference it, delete room blocked if any live stay/reservation references it, bulk-add by numeric range, inline type change.
- `/rooms` list endpoint returning each room's **derived** status (same priority order as the prototype: occupied > cleaning > repair > booked > free) computed in the repository query, not cached on the row.
- Housekeeping endpoints: mark ready / send to repair (with note) / send to cleaning, writing a `housekeeping_logs` row each time.
- Settings endpoints (hotel name/place, GST slabs, whether extras are taxed, checkout hour) with admin-only write.
- Verify: `php -l`, PHPUnit for the status-derivation and range-add logic, curl smoke tests.

## Phase 4 — Booking + check-in/out + billing APIs
- Reservation create/edit/cancel: server-side overlap check (`reservations`+`stays` both block candidate dates) **inside a transaction with `SELECT ... FOR UPDATE`** on the room row, so two simultaneous requests can't double-book; guest look-up/creation by phone; booking code generated from the inserted auto-increment id (`BK-` + id), never from array length.
- Check-in (direct or from a reservation): same transaction+lock pattern; converting a reservation always sets actual `check_in = today` and recomputes `checkout_planned`, per the preserved business rule.
- Checkout: recompute bill server-side (nights × rate + GST(rate) + Σ taxed/untaxed extras per `settings`), accept extra charges and a payment, stamp `actual_checkout = today`, flip room to cleaning, write `stay_charges`/`payments` rows, generate the sequential GST `invoices` row (unique per financial year) and return a printable payload.
- Extend stay, early checkout, overstay, no-show marking, cancellation with an optional refund `payments` row.
- Audit log entries for check-in, checkout, cancel, rate change, room delete.
- PHPUnit tests: overlap rejection, GST slab boundaries (₹1000/₹7500), bill totals with/without extras taxed, invoice numbering sequence & FY rollover.
- Verify: `php -l`, PHPUnit, curl smoke tests for the full booking→check-in→extras→checkout→invoice happy path and the double-booking rejection path.

## Phase 5 — Frontend foundation + Rooms screen
- Vite + React 18 + TypeScript-free JS (match prototype's plain JS feel) or TS per convention; React Router (Login, Rooms, Bookings, Guests, Bills, Reports, Room Master, Users, Settings routes); TanStack Query client wired to the API; React Hook Form + Zod for the check-in/booking forms.
- Port design tokens/fonts/dark-mode 1:1 from the prototype into plain CSS; shared `Sheet`/`Modal` component (bottom-sheet on mobile, centered modal on desktop, Esc + scrim-click to close) used for every room action, matching the prototype's single-popup pattern.
- Rooms screen: status counters/filters, floor-grouped tiles from the live API, Direct Check-in and New Booking flows, skeleton loaders, toasts, optimistic updates on check-in/checkout/housekeeping actions.
- `.env.example` (API base URL).
- Verify: `npm run build` clean (no warnings), manual browser pass of the check-in/checkout/housekeeping flows against the Phase 2-4 API.

## Phase 6 — Remaining screens
- Login (JWT storage, redirect-on-401), Bookings (grouped list + open/cancel/edit/check-in), Guests (search, profile with stay history and masked ID), Bills/Invoices (list + printable invoice view), Room Master (types/rooms management), Users (admin CRUD + role assignment), Settings (hotel, GST, checkout hour).
- Loading/error/empty states on every screen; keyboard shortcut (Esc) and accessible focus states throughout.
- Verify: `npm run build`, manual pass of every screen and role-gated UI (receptionist vs admin).

## Phase 7 — Reports + invoice print
- Reports API + screen: today summary, day-end cash/UPI/card collection, occupancy %, revenue by date range, CSV export.
- Printable GST invoice (HTML, print-styled; PDF export if a lightweight PHP PDF lib is warranted) with GSTIN, tax split, sequential number.
- Verify: curl smoke tests for report endpoints + CSV content-type/shape, manual print-preview check.

## Phase 8 — Tests, hardening, README
- Fill out remaining PHPUnit coverage for critical flows (overlap, bill calc, GST, invoice numbering) if not already complete; tighten input validation and error responses; re-run `php -l` across the tree.
- `README.md`: exact XAMPP steps (place backend, import `schema.sql`+`seed.sql` via phpMyAdmin, configure `.env`, `npm run dev`), production section (`npm run build`, Apache vhost + HTTPS, `display_errors=off` and other prod `php.ini` settings, `mysqldump` backup script + cron, file permissions, deployment checklist).
- Final verify: full `php -l`, PHPUnit suite, `npm run build`, end-to-end curl smoke script.

Each phase finishes with a short written summary (what landed, what's next) before moving to the next one.
