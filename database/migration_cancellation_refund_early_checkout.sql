-- Migration: Cancellation, Refund, and Early Checkout Policy & Financial Workflow
USE tamarind_court;

-- 1. Settings: Cancellation & Early Checkout Policies
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

-- 2. Reservations: Cancellation Fee, Refundable Amount, Cancelled By
ALTER TABLE reservations
  ADD COLUMN cancellation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cancel_reason,
  ADD COLUMN refundable_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER cancellation_fee,
  ADD COLUMN cancelled_by INT UNSIGNED NULL AFTER refundable_amount,
  ADD CONSTRAINT fk_reservations_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Stays: Discounts & Early Checkout Fee
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

-- 6. Trigger update: Reservations trigger should not block if stay is already checked out or reservation cancelled
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

DROP TRIGGER IF EXISTS trg_reservations_prevent_overlap_update$$
CREATE TRIGGER trg_reservations_prevent_overlap_update
BEFORE UPDATE ON reservations
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending', 'checked_in') THEN
    IF EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.room_id = NEW.room_id
        AND r.id != NEW.id
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
