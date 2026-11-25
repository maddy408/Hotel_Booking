-- Tamarind Court: One Room, One Current Guest Fix & Checked-Out Reservation Status
-- 1. Extend reservations.status enum to include 'checked_out'
-- 2. Safely update historical reservations whose stays have completed checkout
-- 3. Add virtual column and unique constraint to prevent multiple active checked-in reservations for the same room

USE tamarind_court;

-- Step 1: Extend status ENUM to include 'checked_out'
ALTER TABLE reservations 
  MODIFY COLUMN status ENUM('pending','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'pending';

-- Step 2: Safe correction of existing historical records:
-- If the reservation has an associated stay that is checked out, update reservation status to 'checked_out'
UPDATE reservations r
JOIN stays s ON s.reservation_id = r.id
SET r.status = 'checked_out'
WHERE r.status = 'checked_in' AND s.status = 'checked_out';

-- If a reservation is marked 'checked_in' but has no active 'in_house' stay, update to 'checked_out'
UPDATE reservations r
LEFT JOIN stays s ON s.reservation_id = r.id AND s.status = 'in_house'
SET r.status = 'checked_out'
WHERE r.status = 'checked_in' AND s.id IS NULL;

-- Step 3: Add virtual generated column and unique constraint on reservations
-- This guarantees at the database level that a room can have at most ONE checked_in reservation at a time.
ALTER TABLE reservations 
  ADD COLUMN IF NOT EXISTS active_checked_in_room_id INT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status = 'checked_in' THEN room_id ELSE NULL END
  ) VIRTUAL;

DROP INDEX IF EXISTS uq_reservations_active_room ON reservations;
ALTER TABLE reservations 
  ADD UNIQUE KEY uq_reservations_active_room (active_checked_in_room_id);
