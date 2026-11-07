-- Migration: Tamarind Court Business Logic Fixes
-- Adds checkout time support and payment status

ALTER TABLE reservations ADD COLUMN check_out_time TIME NOT NULL DEFAULT '12:00:00' AFTER check_out_date;
ALTER TABLE stays ADD COLUMN checkout_time TIME NOT NULL DEFAULT '12:00:00' AFTER checkout_planned;
ALTER TABLE payments ADD COLUMN status ENUM('successful','pending','failed') NOT NULL DEFAULT 'successful' AFTER method;
