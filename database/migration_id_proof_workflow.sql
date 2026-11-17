-- Migration: ID Proof Document Workflow – Pre-Booking, Check-In and Guest Details
-- Links occupant_documents to reservations and stays, making occupant_id nullable.

ALTER TABLE occupant_documents
  ADD COLUMN reservation_id INT UNSIGNED NULL DEFAULT NULL AFTER hotel_id,
  ADD COLUMN stay_id INT UNSIGNED NULL DEFAULT NULL AFTER reservation_id,
  MODIFY COLUMN occupant_id INT UNSIGNED NULL DEFAULT NULL;

-- Add index and foreign key constraints
ALTER TABLE occupant_documents
  ADD KEY ix_occupant_documents_reservation (reservation_id),
  ADD KEY ix_occupant_documents_stay (stay_id);

ALTER TABLE occupant_documents
  ADD CONSTRAINT fk_occupant_documents_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_occupant_documents_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE;

-- Backfill stay_id from occupants table for existing records
UPDATE occupant_documents od
JOIN occupants o ON o.id = od.occupant_id
SET od.stay_id = o.stay_id
WHERE od.stay_id IS NULL;

-- Backfill reservation_id for stays that originated from a reservation
UPDATE occupant_documents od
JOIN stays s ON s.id = od.stay_id
SET od.reservation_id = s.reservation_id
WHERE od.reservation_id IS NULL AND s.reservation_id IS NOT NULL;
