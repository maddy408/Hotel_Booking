# Hotel Booking Cancellation, Refund and Early Checkout – Implementation and QA Test Report

**System:** Tamarind Court Front Desk – Hotel Management System  
**Date:** November 7, 2026  
**Role:** Senior Hotel Management System Architect, Backend Developer & QA Engineer  
**Status:** Complete, Verified & Tested (135/135 tests passing, 0 regressions)

---

## 1. Executive Summary

A complete, robust, and auditable financial workflow has been implemented for:
1. **Booking cancellation before check-in** with policy-based fee calculation, advance adjustment, and date-range room release.
2. **Early checkout after check-in** with actual stay duration recalculation, unused nights policy handling, extras, discounts, and GST recalculation.
3. **Advance payment adjustments** ensuring only actual successful payments are credited and never treating entered advance amounts as completed transactions.
4. **Partial and full refund management** supporting single and multiple partial refunds, linkage to parent payment records, refund statuses (`successful`, `pending`, `failed`), and preventing over-refunds.
5. **Final invoice recalculation and issuance** with GST sequencing, discount recording, early checkout fee recording, and zero-balance enforcement.
6. **Room status lifecycle integration** where cancelled bookings release room dates immediately, early checkouts transition rooms to `cleaning` (blocked until housekeeping marks `ready`), and future reservations are strictly preserved without duplicate active stays.

All 20 required QA scenarios were implemented in an automated integration test suite (`Tests\Integration\CancellationRefundEarlyCheckoutTest`) and executed with 100% success (20/20 scenarios, 84 assertions). The entire backend test suite now passes with 135 tests and 611 assertions. The frontend build compiles cleanly in Vite without errors.

---

## 2. Existing Implementation Analysis & Architectural Audit

Before introducing any modifications, the existing codebase, schema, and workflows were inspected in detail:

### 2.1 Schema & Table Reuse
- **`reservations`**: Stored planned dates (`check_in_date`, `check_out_date`), rate, entered `advance_amount`, and status (`pending`, `checked_in`, `cancelled`, `no_show`). It lacked persistent columns for the calculated `cancellation_fee`, `refundable_amount`, and `cancelled_by` user audit references.
- **`stays`**: Handled in-house and checked-out stays (`checkout_planned`, `checkout_actual`). It lacked columns for stay-level discounts (`discount_amount`, `discount_reason`) and early checkout penalty deductions (`early_checkout_fee`).
- **`payments`**: Held payment transactions (`type`: `advance`, `balance`, `refund`, `extra`; `status`: `successful`, `pending`, `failed`). It did not track `parent_payment_id` to link a refund back to its specific original payment or record reasons for refunds.
- **`invoices`**: Created sequential GST invoices upon checkout with snapshot fields for `room_amount`, GST, extras, and `advance_paid`. It did not track stay discounts, early checkout fees, or refund amounts issued on checkout.
- **`settings`**: Configured GST slabs and checkout hour, but lacked hotel-level configurable policies for cancellation deadlines, free cancellation rules, cancellation fee rates, and early checkout unused-night refundability.
- **Database Triggers**: `trg_reservations_prevent_overlap_insert` and `trg_reservations_prevent_overlap_update` were checking `status IN ('pending', 'checked_in')` without checking whether a checked-in reservation's stay was still `in_house`. Consequently, if a guest checked out early, subsequent bookings for the originally planned dates were inadvertently blocked by the trigger.

### 2.2 Reused Functionality (No Duplication)
- Reused existing `payments` table and its status lifecycle (`successful`, `pending`, `failed`).
- Reused existing `stays` and `reservations` relationship (`stays.reservation_id`).
- Reused `BillingService` and `GstService` for accurate GST slab calculations (0%, 5%, 18%).
- Reused `InvoiceService` mutex serialization via `SELECT ... FOR UPDATE` on `settings` for gapless financial year sequence generation.
- Reused existing audit logging system (`audit_logs`) across all financial mutations.

---

## 3. Database Schema Changes & Migration

A clean, non-destructive migration script was created at `database/migration_cancellation_refund_early_checkout.sql` and mirrored into `database/schema.sql`:

```sql
-- 1. Settings: Cancellation & Early Checkout Configurable Policies
ALTER TABLE settings
  ADD COLUMN cancellation_deadline_hours INT UNSIGNED NOT NULL DEFAULT 24 AFTER whatsapp_checkin_enabled,
  ADD COLUMN cancellation_free_allowed TINYINT(1) NOT NULL DEFAULT 1 AFTER cancellation_deadline_hours,
  ADD COLUMN cancellation_fee_type ENUM('none', 'fixed', 'percentage', 'first_night') NOT NULL DEFAULT 'none' AFTER cancellation_free_allowed,
  ADD COLUMN cancellation_fee_value DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cancellation_fee_type,
  ADD COLUMN cancellation_late_fee_type ENUM('none', 'fixed', 'percentage', 'first_night') NOT NULL DEFAULT 'percentage' AFTER cancellation_fee_value,
  ADD COLUMN cancellation_late_fee_value DECIMAL(10,2) NOT NULL DEFAULT 10.00 AFTER cancellation_late_fee_type,
  ADD COLUMN early_checkout_refund_unused_nights TINYINT(1) NOT NULL DEFAULT 1 AFTER cancellation_late_fee_value,
  ADD COLUMN early_checkout_fee_type ENUM('none', 'fixed', 'percentage', 'one_night') NOT NULL DEFAULT 'none' AFTER early_checkout_refund_unused_nights,
  ADD COLUMN early_checkout_fee_value DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER early_checkout_fee_type;

-- 2. Reservations: Financial Cancellation Details
ALTER TABLE reservations
  ADD COLUMN cancellation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cancel_reason,
  ADD COLUMN refundable_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cancellation_fee,
  ADD COLUMN cancelled_by INT UNSIGNED NULL AFTER refundable_amount,
  ADD CONSTRAINT fk_reservations_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Stays: Stay Discounts & Early Checkout Fee
ALTER TABLE stays
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER payment_method,
  ADD COLUMN discount_reason VARCHAR(255) NULL AFTER discount_amount,
  ADD COLUMN early_checkout_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER discount_reason;

-- 4. Invoices: Discounts, Early Checkout Fee, Refund Amount
ALTER TABLE invoices
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER balance_amount,
  ADD COLUMN early_checkout_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER discount_amount,
  ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER early_checkout_fee;

-- 5. Payments: Parent payment tracking for refunds & reason
ALTER TABLE payments
  ADD COLUMN parent_payment_id BIGINT UNSIGNED NULL AFTER stay_id,
  ADD COLUMN reason VARCHAR(255) NULL AFTER note,
  ADD CONSTRAINT fk_payments_parent FOREIGN KEY (parent_payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  ADD KEY ix_payments_parent (parent_payment_id);

-- 6. Trigger update: Prevents overlap only for pending reservations and active in-house stays
DELIMITER $$
DROP TRIGGER IF EXISTS trg_reservations_prevent_overlap_insert$$
CREATE TRIGGER trg_reservations_prevent_overlap_insert
BEFORE INSERT ON reservations
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.room_id = NEW.room_id
        AND (
          r.status = 'pending'
          OR (r.status = 'checked_in' AND EXISTS (
            SELECT 1 FROM stays s WHERE s.reservation_id = r.id AND s.status = 'in_house'
          ))
        )
        AND r.check_in_date < NEW.check_out_date
        AND NEW.check_in_date < r.check_out_date
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This room is already booked for part of those dates. Pick another room or change the dates.';
    END IF;
  END IF;
END$$
DELIMITER ;
```

---

## 4. Financial Calculations & Calculation Examples

### 4.1 Booking Cancellation Before Check-in

#### Rules:
1. **Advance Calculation**: Only payments in `payments` with `status = 'successful'` and `type IN ('advance', 'balance', 'extra')` minus successful refunds are counted. Any `advance_amount` entered into the booking form that was never collected is strictly excluded.
2. **Policy Evaluation**:
   - `hoursUntilCheckIn = checkInDateTime - currentDateTime`
   - If `hoursUntilCheckIn >= cancellation_deadline_hours`:
     - If `cancellation_free_allowed == 1`: Fee = ₹0.00.
     - Else: Fee is calculated based on `cancellation_fee_type` (`fixed`, `percentage`, `first_night`).
   - If `hoursUntilCheckIn < cancellation_deadline_hours` (Late cancellation):
     - Fee is calculated based on `cancellation_late_fee_type` and `cancellation_late_fee_value`.
   - The fee is capped at `eligibleSuccessfulPayments` so the hotel never demands more than paid.
3. **Refundable Amount**:
   $$\text{Refundable Amount} = \max(0, \text{Eligible Successful Payments} - \text{Cancellation Fee})$$

#### Illustrative Example 1 (Standard Policy):
- **Reservation**: Nov 6 to Nov 10 (4 nights @ ₹2,000/night).
- **Advance Paid**: ₹2,000 (verified successful payment).
- **Hotel Policy**: Fixed cancellation fee of ₹500.
- **Calculation**:
  $$\text{Eligible Paid} = ₹2,000$$
  $$\text{Cancellation Fee} = ₹500$$
  $$\text{Refundable Amount} = ₹2,000 - ₹500 = ₹1,500$$

#### Illustrative Example 2 (Unpaid Advance):
- **Reservation**: Advance entered on form = ₹2,000, but payment failed or was never processed.
- **Calculation**:
  $$\text{Eligible Paid} = ₹0$$
  $$\text{Cancellation Fee} = ₹0$$
  $$\text{Refundable Amount} = ₹0$$

---

### 4.2 Early Checkout Financial Workflow

#### Rules:
1. **Actual Stay Nights**:
   $$\text{Actual Nights} = \max(1, \text{nightsBetween}(\text{check\_in\_date}, \text{actual\_checkout\_date}))$$
2. **Billable Room Charges**:
   - If policy `early_checkout_refund_unused_nights == 1` (default):
     $$\text{Room Charges} = \text{Actual Nights} \times \text{Daily Room Rate}$$
   - If policy `early_checkout_refund_unused_nights == 0` (non-refundable unused nights):
     $$\text{Room Charges} = \text{Planned Nights} \times \text{Daily Room Rate}$$
3. **Early Checkout Penalty Fee**:
   - Fixed, percentage of unused nights, or 1 night tariff penalty according to hotel policy.
4. **Final Invoice Total**:
   $$\text{Final Invoice} = \text{Actual Room Charges} + \text{Applicable GST} + \text{Stay Extras} + \text{Early Checkout Fee} - \text{Discounts}$$
5. **Net Payments**:
   $$\text{Net Payments} = \sum(\text{Successful Payments}) - \sum(\text{Successful Refunds})$$
6. **Outstanding Balance / Settlement**:
   $$\text{Outstanding Balance} = \text{Final Invoice} - \text{Net Payments}$$
   - **If positive**: Guest owes money. Mandatory full collection before checkout completion.
   - **If negative**: Guest is eligible for refund ($|\text{Outstanding Balance}|$). Refund recorded against parent payments.
   - **If zero**: No collection or refund needed. Checkout completes immediately.

#### Illustrative Example (Section 4 of Prompt):
- **Room rate**: ₹2,000 / night.
- **Planned stay**: 4 nights.
- **Actual stay**: 2 nights.
- **Actual room charges**: $2 \times ₹2,000 = ₹4,000$.
- **GST (5% slab)**: $₹4,000 \times 0.05 = ₹200$.
- **Additional charges (Food extra)**: ₹300.
- **Advance paid successfully**: ₹2,000.
- **Calculations**:
  $$\text{Final Invoice} = ₹4,000 + ₹200 + ₹300 = ₹4,500$$
  $$\text{Total Net Payments} = ₹2,000$$
  $$\text{Outstanding Balance} = ₹4,500 - ₹2,000 = +₹2,500$$
- **Settlement**: Guest pays ₹2,500 by cash/UPI/card. Final invoice issued for ₹4,500 with ₹0 balance.

#### Illustrative Example (Early Checkout with Refund):
- **Planned stay**: 4 nights @ ₹2,000 = ₹8,000 + ₹400 GST = ₹8,400.
- **Advance paid**: ₹8,400 (paid in full at check-in).
- **Actual checkout**: after 2 nights.
- **Actual bill**: $2 \times ₹2,000 = ₹4,000$ + ₹200 GST = ₹4,200.
- **Calculations**:
  $$\text{Final Invoice} = ₹4,200$$
  $$\text{Net Payments} = ₹8,400$$
  $$\text{Outstanding Balance} = ₹4,200 - ₹8,400 = -₹4,200$$
- **Settlement**: Hotel refunds ₹4,200 to guest via UPI/cash/card against original advance payment #1. Balance becomes ₹0, checkout completes, room goes to cleaning.

---

## 5. Refund Management Architecture

The dedicated refund action supports:
- **Parent Payment Tracing**: Every refund references `parent_payment_id`.
- **Remaining Balance Enforcement**: A payment with amount ₹2,000 can only be refunded up to ₹2,000 across multiple partial refunds:
  $$\text{Remaining Balance} = \text{Original Payment Amount} - \sum(\text{Successful Refunds against it})$$
- **Multiple Partial Refunds**: Guest can receive multiple partial refunds (e.g., ₹800 then ₹700) until the eligible refund amount or payment balance reaches zero.
- **Status Lifecycle (`successful`, `pending`, `failed`)**:
  - `successful`: Money returned and confirmed by staff. Deducted from eligible balance.
  - `pending`: Transaction in progress (e.g. UPI/bank transfer awaiting confirmation).
  - `failed`: Transaction failed at gateway or bank. Preserved in history for audit, but does **not** reduce remaining eligible refund balance.
- **Idempotency & Duplicate Prevention**: Double submissions are blocked by checking that the refund amount does not exceed the remaining eligible balance.

---

## 6. Modified & New APIs

### Reservations
- `GET /reservations/{id}/cancellation-preview` (New)
  Returns full cancellation calculation preview: entered advance vs actual successful payments, breakdown of successful/pending/failed payments, policy rules, cancellation fee, and refundable amount.
- `POST /reservations/{id}/cancel` (Enhanced)
  Accepts `reason`, `cancellationFee`, `refundAmount`, `refundMethod`, `processRefund`, `parentPaymentId`. Updates status to `cancelled`, sets `cancelled_at`, `cancelled_by`, `cancellation_fee`, `refundable_amount`, releases room dates, and creates audit log.
- `GET /reservations/{id}/refund-summary` (New)
  Returns complete refund breakdown, past refunds, parent payments with remaining balances, and final eligible refund.
- `POST /reservations/{id}/refund` (New)
  Processes dedicated full or partial refund against specific parent payment with validation, reason, method, and status.

### Stays & Early Checkout
- `GET /stays/{id}/early-checkout-preview?checkoutDate=YYYY-MM-DD&discount=X&earlyCheckoutFee=Y` (New)
  Calculates actual stay duration, planned nights, unused nights, room charges, extras, discounts, taxes, net payments, outstanding balance, and eligible refund.
- `POST /stays/{id}/checkout` (Enhanced)
  Accepts `paymentMethod`, `amount`, `actualCheckoutDate`, `discountAmount`, `discountReason`, `earlyCheckoutFee`, `refundParentPaymentId`, `refundReason`. Settles balance (payment or refund), recalculates invoice, marks stay `checked_out`, sets room housekeeping to `cleaning`, logs housekeeping action, frees future reservation dates, and issues GST invoice.
- `POST /stays/{id}/discount` (New)
  Applies stay-level discount with reason and audit log.
- `GET /stays/{id}/refund-summary` (New)
  Returns stay refund history and eligible refund balance.
- `POST /stays/{id}/refund` (New)
  Processes dedicated refund on a stay record.

### Settings
- `PUT /settings/policies` (New)
  Configures cancellation deadlines, free cancellation toggle, cancellation fee types/values, late cancellation fees, early checkout unused nights policy, and early checkout penalty fees.

---

## 7. Modified & Created Files

| File | Type | Description |
|---|---|---|
| `database/migration_cancellation_refund_early_checkout.sql` | Migration | New columns for policies, cancellation details, stay discounts, invoice fields, payment parent links, and updated overlap triggers. |
| `database/schema.sql` | Schema | Integrated all migration columns and triggers into the master schema. |
| `backend/src/Repository/SettingsRepository.php` | Repository | Added configurable policy fields to allowed update columns. |
| `backend/src/Repository/ReservationRepository.php` | Repository | Added `cancellation_fee`, `refundable_amount`, `cancelled_by` to cancel and find methods. |
| `backend/src/Repository/StayRepository.php` | Repository | Added `discount_amount`, `discount_reason`, `early_checkout_fee` to checkout and update methods. |
| `backend/src/Repository/InvoiceRepository.php` | Repository | Added `discount_amount`, `early_checkout_fee`, `refund_amount` to invoice insertion. |
| `backend/src/Repository/PaymentRepository.php` | Repository | Added parent payment linking, remaining balance queries, refund sum queries, and payment status categorization. |
| `backend/src/Service/BillingService.php` | Service | Added actual stay duration calculation, early checkout policy fees, discount deduction, and balance/refund separation. |
| `backend/src/Service/InvoiceService.php` | Service | Extended `issue()` to persist discount, early checkout fee, and refund amount. |
| `backend/src/Service/ReservationService.php` | Service | Added `cancellationPreview()`, enhanced `cancel()`, `refundSummary()`, `processRefund()`, and `calculateCancellation()`. |
| `backend/src/Service/StayService.php` | Service | Added `earlyCheckoutPreview()`, enhanced `checkout()`, `applyDiscount()`, `refundSummary()`, and `processRefund()`. |
| `backend/src/Controller/SettingsController.php` | Controller | Added `updatePolicies()` endpoint handler. |
| `backend/src/Controller/ReservationController.php` | Controller | Added `cancellationPreview()`, `refundSummary()`, `processRefund()` handlers. |
| `backend/src/Controller/StayController.php` | Controller | Added `earlyCheckoutPreview()`, `applyDiscount()`, `refundSummary()`, `processRefund()` handlers. |
| `backend/src/routes.booking.php` | Routes | Registered cancellation preview, refund, discount, and early checkout routes. |
| `backend/src/routes.rooms.php` | Routes | Registered `PUT /settings/policies` route. |
| `backend/tests/Integration/CancellationRefundEarlyCheckoutTest.php` | Test Suite | 20 comprehensive automated integration test scenarios covering all requirements. |
| `frontend/src/api/reservations.js` | API Client | React Query hooks for cancellation preview, refund summary, and refund processing. |
| `frontend/src/api/stays.js` | API Client | React Query hooks for early checkout preview, stay refund summary, discount, and refund processing. |
| `frontend/src/api/settings.js` | API Client | React Query hook for updating policy settings. |
| `frontend/src/components/sheets/RefundSheet.jsx` | UI Component | Dedicated refund modal supporting full/partial refunds, payment selection, and history. |
| `frontend/src/components/sheets/BookingDetailSheet.jsx` | UI Component | Integrated cancellation preview, policy display, refund selection, and refund management. |
| `frontend/src/components/sheets/CheckoutSheet.jsx` | UI Component | Complete Early Checkout interface with date selector, bill breakdown, discounts, and refunds. |
| `frontend/src/pages/Settings.jsx` | UI Component | Admin settings panel for cancellation and early checkout policy configuration. |

---

## 8. Automated Test Execution Results

The 20 required QA scenarios were executed via PHPUnit against the active database:

```
PHPUnit 10.5.66 by Sebastian Bergmann and contributors.

Runtime:       PHP 8.2.12
Configuration: C:\Users\ramya\Downloads\Hotel_Booking\backend\phpunit.xml

....................                                              20 / 20 (100%)

Time: 00:01.654, Memory: 8.00 MB

OK (20 tests, 84 assertions)
```

### Scenario Breakdown:
1. **Cancel before check-in with full advance**: Pass. Verified status `cancelled`, full advance eligible, room dates freed.
2. **Cancel before check-in with partial advance**: Pass. Verified ₹2,000 paid − ₹500 policy fee = ₹1,500 refundable.
3. **Cancel without any successful payment**: Pass. Verified ₹0 advance eligible, ₹0 fee, ₹0 refundable.
4. **Cancel with a pending payment**: Pass. Verified pending gateway payment is excluded from refundable balance.
5. **Full cancellation refund**: Pass. Verified ₹1,500 refund processed, remaining eligible refund = ₹0.
6. **Partial cancellation refund**: Pass. Verified ₹800 then ₹700 partial refunds; multiple partial refunds tracked correctly.
7. **Failed refund**: Pass. Verified failed refund is logged in history but does not reduce refundable amount; retry succeeds.
8. **Duplicate refund attempt**: Pass. Verified second refund request after balance depletion is rejected with `ApiException`.
9. **Early checkout after one night**: Pass. Verified 4 nights planned, 1 night stayed, ₹2,000 room charge + ₹100 GST = ₹2,100 bill, ₹6,300 refund from ₹8,400 advance.
10. **Early checkout after multiple nights**: Pass. Verified 5 nights planned, 3 nights stayed, ₹6,000 room charge + ₹300 GST = ₹6,300 bill.
11. **Early checkout with full advance**: Pass. Verified ₹8,400 advance paid, ₹4,200 actual bill, ₹4,200 refund issued.
12. **Early checkout with partial advance**: Pass. Verified ₹2,000 advance paid, ₹4,200 bill, ₹2,200 collected at checkout.
13. **Early checkout with additional payments**: Pass. Verified advance + extra payments correctly summed in net payments.
14. **Early checkout where guest owes more money**: Pass. Verified underpayment is rejected; full balance collection required.
15. **Early checkout where guest is eligible for refund**: Pass. Verified negative balance is recorded as refund on checkout.
16. **Early checkout where no refund or balance is due**: Pass. Verified ₹0 balance allows immediate checkout without cash exchange.
17. **Early checkout with additional charges**: Pass. Verified laundry/extras correctly added to bill and collected.
18. **Early checkout with discounts and taxes**: Pass. Verified promotional discount correctly deducted from total and recorded on invoice.
19. **Attempt checkout twice**: Pass. Verified subsequent checkout on already checked out stay is rejected with 409 conflict.
20. **Verify room cleaning and future booking availability**: Pass. Verified room becomes `cleaning`, housekeeping marks `ok`, and future dates are freed for immediate booking.

### Full Suite Regression Check:
```
PHPUnit 10.5.66 by Sebastian Bergmann and contributors.

Runtime:       PHP 8.2.12
Configuration: C:\Users\ramya\Downloads\Hotel_Booking\backend\phpunit.xml

...............................................................  63 / 135 ( 46%)
............................................................... 126 / 135 ( 93%)
.........                                                       135 / 135 (100%)

Time: 00:04.984, Memory: 12.00 MB

OK (135 tests, 611 assertions)
```

---

## 9. Frontend Build Verification

The frontend production build was verified using Vite:

```bash
> frontend@0.0.0 build
> vite build

vite v8.3.5 building client environment for production...
transforming...
✓ 209 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.81 kB │ gzip:   0.45 kB
dist/assets/index-Cul73I-R.css   25.02 kB │ gzip:   5.08 kB
dist/assets/index-B5rTpJ5L.js   586.80 kB │ gzip: 164.64 kB
✓ built in 657ms
```

---

## 10. Database Verification

- **Financial Integrity**: Checked database records in `payments`, `invoices`, `stays`, and `reservations`. No historical payments were overwritten or deleted.
- **Audit Logs**: Verified that `audit_logs` records entries for `booking_create`, `cancel`, `check_in`, `check_out`, `discount`, and `refund` with user ID, timestamps, before JSON, and after JSON.
- **Constraints & Triggers**: Verified that overlapping reservations trigger correctly prevents double-bookings for active reservations while permitting bookings on freed dates after early checkout or cancellation.

---

## 11. Remaining Issues

None. All 20 scenarios, backend APIs, frontend sheets, configurable policies, and test suites are fully implemented and verified.

