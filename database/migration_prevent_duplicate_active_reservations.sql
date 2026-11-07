-- Tamarind Court: Prevent duplicate overlapping active reservations
-- Active reservations have status IN ('pending', 'checked_in')
-- Two active reservations cannot have overlapping half-open date intervals [check_in_date, check_out_date) for the same room.

DELIMITER $$

DROP TRIGGER IF EXISTS trg_reservations_prevent_overlap_insert$$
CREATE TRIGGER trg_reservations_prevent_overlap_insert
BEFORE INSERT ON reservations
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM reservations
      WHERE room_id = NEW.room_id
        AND status IN ('pending', 'checked_in')
        AND check_in_date < NEW.check_out_date
        AND NEW.check_in_date < check_out_date
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This room is already booked for part of those dates. Pick another room or change the dates.';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_reservations_prevent_overlap_update$$
CREATE TRIGGER trg_reservations_prevent_overlap_update
BEFORE UPDATE ON reservations
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM reservations
      WHERE room_id = NEW.room_id
        AND id != NEW.id
        AND status IN ('pending', 'checked_in')
        AND check_in_date < NEW.check_out_date
        AND NEW.check_in_date < check_out_date
    ) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This room is already booked for part of those dates. Pick another room or change the dates.';
    END IF;
  END IF;
END$$

DELIMITER ;
