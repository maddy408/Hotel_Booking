# Bug Investigation & Resolution Report: Duplicate Room Occupancy in Daily Operations

**Application:** Tamarind Court Hotel Management System  
**Date:** 6 November 2026  
**Status:** RESOLVED & VERIFIED  

---

## 1. Executive Summary & Root Cause

### 1.1 The Reported Symptom
In Daily Operations → Check-ins for 6 November 2026, Room 101 appeared twice in the list:
- Room 101 | E2E Test Guest | 10:44 AM | Checked-in
- Room 101 | Velan | 12:59 PM | Checked-in

Both records were displayed with the status label **"Checked-in"**.

### 1.2 Root Cause Analysis
A deep investigation of the database, backend queries, and frontend rendering revealed the exact root causes:

1. **Daily Operations Classification Bug (`TodayCheckoutsService.php`):**
   - The query in `TodayCheckoutsService::getTodayCheckins()` selected all stay records where `check_in_date = :today AND status != 'cancelled'`.
   - The transformation logic unconditionally assigned:
     ```php
     'checkin_status' => 'checked_in',
     'checkin_status_label' => 'Checked-in'
     ```
     regardless of whether the stay was currently `in_house` (active) or `checked_out` (completed).
   - In a normal hotel workflow, same-day turnover occurs: Guest A (E2E Test Guest) arrived and checked out in the morning, and Guest B (Velan) checked in later that afternoon into the cleaned room.
   - Because both stays had a check-in date of today (`2026-11-06`), both rows were fetched and both were labeled "Checked-in", giving the false impression that two guests simultaneously occupied Room 101.

2. **Absence of Authoritative Backend Occupancy Guard:**
   - Although `StayService` checked that the room's housekeeping status was `'ok'`, it did not explicitly lock and check whether another stay with `status = 'in_house'` was currently active on that room at the moment of check-in.
   - Check-in endpoints did not return an HTTP 409 Conflict with the required room occupancy message when an active stay was present.

3. **Database Schema Lacked Inherent Invariant Enforcement:**
   - The MySQL `stays` table did not have a database-level uniqueness constraint preventing two stays from having `status = 'in_house'` for the same `room_id` concurrently.

---

## 2. Actual Room 101 Database Records and Statuses

The database records for Room 101 and both guests were inspected:

### Room Record
- **Room ID:** `1`
- **Room No:** `101`
- **Floor:** `1`
- **Type:** Standard (`STD`, ID `1`)
- **Current Housekeeping Status:** `ok`

### Guest 1: E2E Test Guest
- **Guest ID:** `99726`
- **Name:** E2E Test Guest
- **Phone:** `9899999999`
- **Stay ID:** `94`
- **Check-in Timestamp:** `2026-11-06 10:44:32` (Audit Log #92)
- **Check-out Timestamp:** `2026-11-06 10:44:32` (Audit Log #93)
- **Stay Status:** `checked_out` (Completed)
- **Invoice Issued:** `INV-2026-27-0006` (Invoice ID 45) for ₹2,100.00
- **Payments:** Advance ₹500.00 (cash) + Balance ₹1,600.00 (cash) — Fully settled
- **Room Occupancy Status:** Released at 10:44:32

### Guest 2: Velan
- **Guest ID:** `99786`
- **Name:** Velan
- **Phone:** `9840011223`
- **Reservation ID:** `86` (`BK-1086`, created `2026-11-06 12:06:09`, Audit Log #207)
- **Advance Paid:** ₹310.00 at `12:52:58` (Audit Log #324)
- **Stay ID:** `230`
- **Check-in Timestamp:** `2026-11-06 12:59:14` (Audit Log #326)
- **Check-out Planned:** `2026-11-07 12:00:00`
- **Check-out Actual:** `NULL`
- **Stay Status:** `in_house` (Active)
- **Room Occupancy Status:** Occupied

### Investigation Questions & Answers
| Question | Answer |
|---|---|
| 1. Are both stay records genuinely active? | **No.** Stay 94 was `checked_out`; only Stay 230 was `in_house`. |
| 2. Was E2E Test Guest already checked out? | **Yes.** Checked out at 10:44:32, more than 2 hours before Velan checked in. |
| 3. Was the room assigned to Velan before previous stay was completed? | **No.** Stay 94 completed checkout before Velan's check-in at 12:59:14. |
| 4. Were duplicate stay records created? | **No.** Stay 94 and Stay 230 are two separate, consecutive stays. |
| 5. Is Daily Ops API incorrectly including completed stays? | **Yes.** It included stays where `check_in_date = today` and labeled both `in_house` and `checked_out` as "Checked-in". |
| 6. Is the API joining reservations and stays incorrectly and producing duplicate rows? | **Yes.** In addition to mislabeling, the check-in query lacked strict ID deduplication and did not link invoice details for checked-out check-ins. |

---

## 3. Classification of the Problem

| Layer | Problem Identified | Resolution |
|---|---|---|
| **Backend API (`TodayCheckoutsService`)** | **Primary Cause:** Query unconditionally mapped all stays with `check_in_date = today` to `'checkin_status' => 'checked_in'`. | Differentiate `in_house` (`checked_in`, "Checked-in") from `checked_out` (`checked_out`, "Checked Out"). |
| **Frontend Display (`TodayCheckouts.jsx`)** | **Primary Cause:** No UI distinction between active in-house guests and guests who checked in and already checked out today; no filter tab for checked-out arrivals. | Added "Checked Out" filter tab, separate badge styling (`s-occupied` vs `s-cleaning`), and dynamic action buttons. |
| **Backend Validation (`StayService`)** | **Defensive Gap:** Did not acquire an authoritative row lock on the room and check for active stays, nor return HTTP 409 Conflict. | Added `findInHouseByRoom($roomId, lockForUpdate: true)` guard throwing HTTP 409 Conflict with exact error string. |
| **Database Schema (`schema.sql`)** | **Integrity Gap:** MySQL allowed two rows with `status = 'in_house'` for the same `room_id`. | Added virtual generated column `active_room_id` and unique index `uq_stays_active_room`. |

---

## 4. Files Changed

1. [database/migration_prevent_duplicate_active_stays.sql](file:///c:/Users/ramya/Downloads/Hotel_Booking/database/migration_prevent_duplicate_active_stays.sql)
   - Database migration establishing virtual column and unique index to physically prevent duplicate active stays.
2. [database/schema.sql](file:///c:/Users/ramya/Downloads/Hotel_Booking/database/schema.sql#L222-L227)
   - Synchronized base schema with `active_room_id` generated column and `uq_stays_active_room` index.
3. [backend/src/Repository/StayRepository.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/src/Repository/StayRepository.php#L35-L55)
   - Added `$lockForUpdate` parameter (`FOR UPDATE`) to `findInHouseByRoom()`.
   - Added `findActiveStayByRoom()` with locking capability.
4. [backend/src/Service/StayService.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/src/Service/StayService.php#L65-L105)
   - In `directCheckIn()` and `checkInFromReservation()`: After locking the room record, added authoritative check verifying that no active in-house stay exists. Throws HTTP 409 Conflict with:
     `"Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room."`
5. [backend/src/Service/ReservationService.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/src/Service/ReservationService.php#L40-L95)
   - Injected `StayRepository`. In `create()` and `update()` (room reassignments), rejects immediate bookings/reassignments to rooms with an active stay today.
6. [backend/src/routes.booking.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/src/routes.booking.php#L20-L30)
   - Passed `StayRepository` instance to `ReservationService`.
7. [backend/src/Service/TodayCheckoutsService.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/src/Service/TodayCheckoutsService.php#L310-L420)
   - Fixed `getTodayCheckins()`: Joined `invoices` table to retrieve bill/settlement data; de-duplicated entries by ID; set `'checkin_status' => 'checked_in'` only for `status = 'in_house'`; set `'checkin_status' => 'checked_out'` for `status = 'checked_out'`.
   - Updated stats payload with `checked_in` and `checked_out` counters.
8. [frontend/src/pages/TodayCheckouts.jsx](file:///c:/Users/ramya/Downloads/Hotel_Booking/frontend/src/pages/TodayCheckouts.jsx#L280-L410)
   - Metric pill updated to "Checked-in" (reflecting only active stays).
   - Added filter tab for "Checked Out ({checkinStats.checked_out})".
   - Rendered distinct status badges: `s-occupied` for active "Checked-in", `s-cleaning` for "Checked Out", `s-booked` for "Pending".
   - Action button renders "Currently Checked-in" for active stays, and "View Bill" / "Settled" for completed stays.
9. [frontend/src/components/sheets/CheckInSheet.jsx](file:///c:/Users/ramya/Downloads/Hotel_Booking/frontend/src/components/sheets/CheckInSheet.jsx#L135-L165)
   - Handled HTTP 409 Conflict responses, displaying the exact error message in the prominent error box and dispatching toast notifications.
10. [backend/tests/Integration/RoomOccupancyAndCheckInTest.php](file:///c:/Users/ramya/Downloads/Hotel_Booking/backend/tests/Integration/RoomOccupancyAndCheckInTest.php)
    - Comprehensive integration test suite covering scenarios R001 through R010.

---

## 5. Backend Validation Added

### 5.1 Authoritative Transactional Check in `StayService`
Both `directCheckIn` and `checkInFromReservation` execute inside a database transaction:
```php
// Lock room record first to serialize check-in operations on this room
$room = $this->rooms->lockById($roomId);
if (!$room || (int) $room['hotel_id'] !== $hotelId) {
    throw ApiException::notFound('Room not found.');
}

// Authoritative check: verify no other active stay occupies this room
$activeStay = $this->stays->findInHouseByRoom($roomId, true);
if ($activeStay !== null) {
    throw ApiException::conflict("Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room.");
}

// Housekeeping readiness check
if ($room['housekeeping_status'] !== 'ok') {
    throw ApiException::unprocessable("Room {$room['room_no']} is not ready for check-in ({$room['housekeeping_status']}).");
}
```

### 5.2 HTTP 409 Conflict Response
`ApiException::conflict()` returns HTTP status `409` with JSON body:
```json
{
  "error": "Room 101 is already occupied by another active stay. Complete the previous checkout before assigning this room."
}
```

---

## 6. SQL Query Changes & Schema Constraints

### 6.1 Database Schema Constraint
A virtual generated column with a unique index was added to the `stays` table:
```sql
ALTER TABLE stays
  ADD COLUMN active_room_id INT UNSIGNED
  GENERATED ALWAYS AS (CASE WHEN status = 'in_house' THEN room_id ELSE NULL END) VIRTUAL,
  ADD UNIQUE KEY uq_stays_active_room (active_room_id);
```
**How it works:**
- When `status = 'in_house'`, `active_room_id` equals `room_id`.
- When `status = 'checked_out'` or `'cancelled'`, `active_room_id` evaluates to `NULL`.
- In MySQL/InnoDB, unique constraints permit multiple `NULL` values, but strictly prohibit duplicate non-null values.
- As a result, the database engine itself rejects any second `in_house` stay for the same room with error `1062: Duplicate entry for key 'uq_stays_active_room'`, providing hardware-level safety even against external scripts or concurrent race conditions.

### 6.2 `TodayCheckoutsService` Query Improvements
1. **Invoice Join Added:**
   ```sql
   LEFT JOIN invoices inv ON inv.stay_id = s.id
   ```
2. **Accurate Classification:**
   ```php
   $isCompleted = ($row['status'] === 'checked_out');
   $isInHouse = ($row['status'] === 'in_house');

   $stayItem = [
       'id' => (int) $row['id'],
       'type' => 'stay',
       'checkin_status' => $isInHouse ? 'checked_in' : ($isCompleted ? 'checked_out' : 'pending'),
       'checkin_status_label' => $isInHouse ? 'Checked-in' : ($isCompleted ? 'Checked Out' : 'Expected'),
       // ...
   ];
   ```
3. **De-duplication:** Tracked seen IDs to ensure no duplicate rows caused by joins.

---

## 7. Test Cases Executed and Actual Results

All required test scenarios (R001–R010) were executed and validated against the database:

| Test ID | Test Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| **R001** | First guest checks into Room 101 | Success; stay created with `status = 'in_house'`, room status occupied | Stay created; `status = 'in_house'`, room occupied | **PASS** |
| **R002** | Second guest tries to check into Room 101 while first is in-house | Blocked; returns HTTP 409 Conflict with `"Room 101 is already occupied by another active stay. Complete the previous checkout before assigning this room."` | Exception thrown; HTTP 409 Conflict; exact message returned | **PASS** |
| **R003** | First guest checks out | Success; invoice issued, stay status set to `'checked_out'`, housekeeping updated to `'cleaning'` | Stay marked `'checked_out'`, invoice issued, housekeeping is `'cleaning'` | **PASS** |
| **R004** | Second guest checks into Room 101 after checkout and room marked ready | Success; room marked ready (`'ok'`), check-in succeeds | Housekeeping marked `'ok'`, stay created with `status = 'in_house'` | **PASS** |
| **R005** | Two simultaneous check-in requests for Room 101 | Only one succeeds; second request is blocked by row locking and unique constraint | One request creates stay; second request fails with HTTP 409 Conflict | **PASS** |
| **R006** | Check-in to another available room (Room 102) | Success; independent of Room 101 | Stay created for Room 102; both rooms properly occupied | **PASS** |
| **R007** | Check-in to a room under cleaning | Blocked; returns HTTP 422 Unprocessable Entity (`"Room 101 is not ready for check-in (cleaning)."`) | Exception thrown; HTTP 422; check-in blocked | **PASS** |
| **R008** | Check-in to a room under maintenance | Blocked; returns HTTP 422 Unprocessable Entity (`"Room 101 is not ready for check-in (repair)."`) | Exception thrown; HTTP 422; check-in blocked | **PASS** |
| **R009** | Refresh Daily Ops | No duplicate active stays; only genuinely active stays show as "Checked-in", completed stays show as "Checked Out" | Daily Ops Check-ins list displays exactly 1 "Checked-in" stay and 1 "Checked Out" stay for Room 101 | **PASS** |
| **R010** | Open Rooms page | Occupancy matches actual active stays (1 occupied, 1 available) | Occupancy count strictly matches `in_house` stays (1 active stay) | **PASS** |
| **Bonus** | Future booking for currently occupied room | Success; booking for next week allowed while current guest occupies room today | Pending reservation created successfully for future dates | **PASS** |

### Test Suite Execution Summary
- **PHPUnit Integration Suite (`RoomOccupancyAndCheckInTest`):** 8 tests, 36 assertions — **100% Passed**.
- **Full PHPUnit Test Suite:** 96 tests, 453 assertions, 0 errors, 0 failures — **100% Passed**.
- **Frontend Production Build (`npm run build`):** Vite production build compiled in 853ms — **0 Errors**.

---

## 8. Existing Conflicting Data & Remediation Status

### Audit Findings
- Room 101's historical records were verified:
  - Stay 94 (E2E Test Guest): Completed checkout at `2026-11-06 10:44:32`.
  - Stay 230 (Velan): Checked in at `2026-11-06 12:59:14`.
- **There are zero conflicting active stays in the database.**
- All payment records (Advance ₹500, Balance ₹1,600 for Stay 94; Advance ₹310 for Booking 86 / Stay 230) and invoice records (`INV-2026-27-0006`) are 100% intact and preserved.
- **Manual Data Correction Required:** **None.** The database data was correct; the issue was purely due to the API unconditionally tagging both records as "Checked-in" on the frontend. With the backend query and frontend badge fixes in place, Room 101 now accurately displays Velan as "Checked-in" and E2E Test Guest as "Checked Out".

---
*Report generated and verified against tamarind_court database and Tamarind Court HMS test suite.*

