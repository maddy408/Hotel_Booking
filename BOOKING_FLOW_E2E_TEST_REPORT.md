# Booking Flow & Room Availability E2E Test Report

**Application:** Tamarind Court Hotel Management System  
**Date:** 7 November 2026  
**Status:** RESOLVED & VERIFIED  

---

## 1. Executive Summary & Exact Root Cause Analysis

### 1.1 The Reported Symptom
In the Bookings page, Room 209 already had booking **BK-1002** (6 Nov 2026 to 7 Nov 2026), but the application appeared to allow selecting Room 209 when creating another booking.

### 1.2 Exact Reason Why Room 209 Could Be Selected Again
A comprehensive investigation across the database, backend APIs, reservation service, and frontend components revealed the exact reasons why Room 209 appeared selectable:

1. **Default New Booking Date Initialization (`NewBookingSheet.jsx`):**
   - When the user clicks **"+ New booking"** on the Bookings page, the sheet initializes the default form values:
     ```javascript
     checkIn: addDaysIso(todayIso(), 1) // Tomorrow (8 Nov 2026)
     days: 1                            // Leaves 9 Nov 2026
     ```
   - Because `checkIn` defaulted to tomorrow (`2026-11-08`) and `checkOut` to `2026-11-09`, the frontend sent `GET /reservations/free-rooms?checkIn=2026-11-08&checkOut=2026-11-09`.
   - Since BK-1002's date range ended on `2026-11-07`, Room 209 was genuinely free on `[2026-11-08, 2026-11-09)`. The API returned Room 209 as `available_ready` (`is_bookable: true`), displaying a green badge that allowed the user to click and select Room 209.

2. **Consecutive Same-Day Turnover Rule for Today (`2026-11-07`):**
   - If the user changed the check-in date to **Today (7 Nov 2026)**, the half-open interval rule `[checkIn, checkOut)` evaluated:
     `check_in_date < :check_out AND :check_in < check_out_date`
   - For BK-1002 (`check_in_date = 2026-11-06`, `check_out_date = 2026-11-07`), `:check_in < check_out_date` evaluated to `'2026-11-07' < '2026-11-07'`, which is `FALSE`.
   - By standard hotel turnover convention (checkout at 12:00 noon, check-in at 12:00 noon), a booking checking out on 7 November does not conflict with a booking arriving on 7 November. Thus, Room 209 was also returned as `available_ready`.

3. **Critical Backend Flaw in Active Reservation Overlap Check (`ReservationRepository::overlapping()`):**
   - The query in `ReservationRepository::overlapping()` was:
     ```sql
     SELECT * FROM reservations
     WHERE room_id = :room_id AND status = 'pending'
       AND check_in_date < :check_out AND :check_in < check_out_date
     ```
   - It **strictly filtered by `status = 'pending'`**. If another active reservation had `status = 'checked_in'`, `overlapping()` completely ignored it, allowing a second booking to be created for the same room with overlapping dates.

4. **Zero Database-Level Guard on `reservations`:**
   - The MySQL database had no triggers or unique constraints on `reservations` preventing two active reservations from having overlapping date ranges on the same room. Direct SQL insertions and concurrent requests completely bypassed application logic.

5. **Consecutive Booking Block on Active In-House Stays (`StayRepository::overlapping()`):**
   - In `StayRepository::overlapping()`, the calculation:
     `CASE WHEN checkout_planned > :today THEN checkout_planned ELSE DATE_ADD(:today, INTERVAL 1 DAY) END`
     treated stays with scheduled checkout **today** (`checkout_planned == :today`) as overstays and pushed their effective departure to tomorrow. This incorrectly blocked legitimate consecutive bookings on checkout day.

6. **Missing No-Show Action in UI:**
   - Although the backend endpoint `POST /reservations/{id}/no-show` and frontend hook `useNoShowReservation()` existed, the UI in `Bookings.jsx` and `BookingDetailSheet.jsx` provided no button to mark past unfulfilled reservations as no-show, leaving expired pending bookings lingering.

---

## 2. Actual Room 209 & BK-1002 Database Record

The database records for BK-1002 and Room 209 were inspected:

### 2.1 Reservation Record (BK-1002)
- **ID:** `227`
- **Hotel ID:** `1`
- **Booking Code:** `BK-1002`
- **Room ID:** `19` (Room 209)
- **Guest ID:** `99992` (Sangeetha Vel, Phone `9790145528`)
- **Check-in Date:** `2026-11-06`
- **Checkout Date:** `2026-11-07`
- **Checkout Time:** `12:00:00`
- **Persons:** `4`
- **Rate:** `₹4,800.00`
- **Advance Paid:** `₹0.00`
- **Booking Status:** `pending`
- **Cancelled At / Reason:** `NULL`
- **Associated Stay:** `NULL` (Guest never checked in; stay record was never created)

### 2.2 Room Record (Room 209)
- **ID:** `19`
- **Hotel ID:** `1`
- **Room Number:** `209`
- **Floor:** `2`
- **Room Type ID:** `3` (Family `FAM`, Rate `₹4,800.00`, Max Persons `4`)
- **Housekeeping Status:** `ok` (Ready)

---

## 3. Investigation of System Layers

| Layer | Component | Finding | Resolution |
|---|---|---|---|
| **Database** | MySQL Schema & Constraints | No database trigger or unique constraint prevented overlapping active reservations. | Created database triggers `trg_reservations_prevent_overlap_insert` and `trg_reservations_prevent_overlap_update` raising `SQLSTATE '45000'` on date overlap for active reservations (`pending`, `checked_in`). |
| **Backend Repository** | `ReservationRepository::overlapping()` | Only queried `status = 'pending'`, ignoring active reservations with `status = 'checked_in'`. | Updated query to include active checked-in reservations whose stays are currently `in_house`. |
| **Backend Repository** | `StayRepository::overlapping()` | Evaluated `checkout_planned > :today`, misclassifying stays checking out today as overstays and blocking consecutive turnover. | Changed comparison to `checkout_planned >= :today`, allowing consecutive booking on planned checkout date while retaining overstay protection for past checkouts. |
| **Backend Service** | `ReservationService::create()` & `update()` | Unconditional `findInHouseByRoom()` blocked creating bookings for today even when the active stay checked out today. | Scoped check to ensure bookings are only blocked if the in-house stay extends beyond the booking check-in (`checkout_planned > checkIn`). |
| **Frontend UI** | `NewBookingSheet.jsx` | Submissions could proceed if room was unbookable or missing from `freeRooms`. | Added defensive validation in `onSubmit()` ensuring room must exist in `freeRooms` and have `is_bookable !== false`. |
| **Frontend UI** | `BookingDetailSheet.jsx` | Past reservations ("Not came") had no option to mark no-show. | Added "Mark no-show" button calling `useNoShowReservation()`, freeing the room when the guest fails to arrive. |

---

## 4. Key Rules Enforced

1. **Active Reservation Overlap Prevention:**
   Two active reservations (`pending` or `checked_in` with active stay) cannot have overlapping half-open intervals `[check_in_date, check_out_date)` for the same room. Enforced on both backend service and MySQL database trigger level.

2. **Consecutive Bookings Allowed:**
   Half-open intervals `[check_in, check_out)` guarantee that if Guest A checks out on 7 November, Guest B can check in on 7 November without conflict.

3. **Booking Edits & Room Reassignment:**
   `ReservationService::update()` locks the room row, checks availability with `excludeReservationId: $reservationId`, and rejects reassignment to any room that has an active overlapping reservation or stay.

4. **Cancelled & No-Show Bookings:**
   Reservations with status `'cancelled'` or `'no_show'` are completely excluded from overlap checks and do not block availability.

5. **Active In-House Stays:**
   Active in-house stays prevent another conflicting booking across their occupancy period. Stays that have slipped into overstay status (`checkout_planned < today`) automatically extend their blocking window through tomorrow (`today + 1`).

---

## 5. Changes Made

### 5.1 Database Triggers (`database/migration_prevent_duplicate_active_reservations.sql` & `database/schema.sql`)
- Created `trg_reservations_prevent_overlap_insert`:
  Prevents inserting any active reservation (`pending`, `checked_in`) if an overlapping active reservation exists on the same room.
- Created `trg_reservations_prevent_overlap_update`:
  Prevents updating any active reservation if an overlapping active reservation exists on the same room (`id != NEW.id`).

### 5.2 Backend Services & Repositories
- **`backend/src/Repository/ReservationRepository.php`:**
  Updated `overlapping()` to check active reservations:
  ```sql
  WHERE room_id = :room_id
    AND (
      status = 'pending'
      OR (status = 'checked_in' AND EXISTS (
        SELECT 1 FROM stays s
        WHERE s.reservation_id = reservations.id AND s.status = 'in_house'
      ))
    )
    AND check_in_date < :check_out AND :check_in < check_out_date
  ```
- **`backend/src/Repository/StayRepository.php`:**
  Updated `overlapping()` condition from `checkout_planned > :today` to `checkout_planned >= :today`.
- **`backend/src/Service/ReservationService.php`:**
  Updated `create()` and `update()` active stay check from `$activeStay !== null` to `$activeStay !== null && $activeStay['checkout_planned'] > $checkIn` so consecutive turnover bookings on scheduled checkout days are permitted.

### 5.3 Frontend Enhancements
- **`frontend/src/components/sheets/BookingDetailSheet.jsx`:**
  Added "Mark no-show" action for reservations with past check-in dates (`reservation.check_in_date < today`), invoking `useNoShowReservation()` to update status and release the room.
- **`frontend/src/components/sheets/NewBookingSheet.jsx`:**
  Hardened `onSubmit()` to prevent submitting when `freeRooms` does not contain the room or `is_bookable === false`.

---

## 6. Test Results

### 6.1 Automated Integration Tests
A dedicated comprehensive test suite `BookingAvailabilityAndWorkflowTest.php` was created covering 10 distinct integration scenarios:

| # | Test Name | Scenario Tested | Result |
|---|---|---|---|
| 1 | `testActualHotel1Bk1002RecordAndIntegrity` | Verifies BK-1002 database record and integrity in Hotel 1 | **PASSED** |
| 2 | `testOverlappingActiveReservationCreationIsBlockedOnServiceLevel` | Rejects overlapping reservation on service layer with 409 Conflict | **PASSED** |
| 3 | `testOverlappingActiveReservationCreationIsBlockedOnDatabaseLevel` | Rejects direct SQL insert on database trigger level with SQLSTATE 45000 | **PASSED** |
| 4 | `testConsecutiveBookingIsAllowed` | Allows consecutive booking where Guest B arrives on Guest A's checkout date | **PASSED** |
| 5 | `testValidationAppliesToBookingEditsAndRoomReassignment` | Rejects reassignment of booking to Room 209 when dates overlap | **PASSED** |
| 6 | `testDatabaseTriggerBlocksOverlappingUpdate` | Database trigger rejects direct SQL update causing date overlap | **PASSED** |
| 7 | `testCancelledBookingDoesNotBlockAvailability` | Cancelled booking immediately releases room availability | **PASSED** |
| 8 | `testNoShowBookingDoesNotBlockAvailability` | No-show booking immediately releases room availability | **PASSED** |
| 9 | `testActiveInHouseStayBlocksOverlappingBooking` | Active in-house stay blocks conflicting future booking | **PASSED** |
| 10 | `testCompleteWorkflowCreateEditCancelAndCheckIn` | Full lifecycle: create -> edit -> cancel -> re-book -> check-in | **PASSED** |

### 6.2 Full Test Suite Results
```text
PHPUnit 10.5.66 by Sebastian Bergmann and contributors.
Runtime:       PHP 8.2.12
Configuration: C:\Users\ramya\Downloads\Hotel_Booking\backend\phpunit.xml

...............................................................  63 / 115 ( 54%)
....................................................            115 / 115 (100%)

Time: 00:03.108, Memory: 12.00 MB
OK (115 tests, 527 assertions)
```

### 6.3 Frontend Build & Lint Results
- **Oxlint:** 0 errors (43 files checked)
- **Vite Build:** Successfully compiled in 835ms:
  `dist/index.html` (0.81 kB)
  `dist/assets/index-Cul73I-R.css` (25.02 kB)
  `dist/assets/index-BVR2vK0l.js` (557.90 kB)

### 6.4 Data Preservation Verification
- Existing Hotel 1 records remained completely intact:
  - Total reservations: `7` (BK-1002 untouched)
  - Total stays: `22`
  - Total payments: `32`

---

## 7. Remaining Issues
None. All 10 requirements from the specification are satisfied, verified, and backed by automated tests and database triggers.

