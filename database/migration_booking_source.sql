-- Tamarind Court: Booking Source & Reference UI Migration
-- Adds booking_source, referred_by_guest_id, and other_source to reservations and stays.
USE tamarind_court;

-- Add columns to reservations
SET @col_bs_res = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'booking_source');
SET @sql_bs_res = IF(@col_bs_res = 0, 'ALTER TABLE reservations ADD COLUMN booking_source VARCHAR(50) NULL DEFAULT \'Social Media\' AFTER notes', 'SELECT 1');
PREPARE stmt_bs_res FROM @sql_bs_res;
EXECUTE stmt_bs_res;
DEALLOCATE PREPARE stmt_bs_res;

SET @col_ref_res = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'referred_by_guest_id');
SET @sql_ref_res = IF(@col_ref_res = 0, 'ALTER TABLE reservations ADD COLUMN referred_by_guest_id INT UNSIGNED NULL AFTER booking_source', 'SELECT 1');
PREPARE stmt_ref_res FROM @sql_ref_res;
EXECUTE stmt_ref_res;
DEALLOCATE PREPARE stmt_ref_res;

SET @col_oth_res = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'other_source');
SET @sql_oth_res = IF(@col_oth_res = 0, 'ALTER TABLE reservations ADD COLUMN other_source VARCHAR(150) NULL AFTER referred_by_guest_id', 'SELECT 1');
PREPARE stmt_oth_res FROM @sql_oth_res;
EXECUTE stmt_oth_res;
DEALLOCATE PREPARE stmt_oth_res;

-- Add columns to stays
SET @col_bs_stay = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stays' AND COLUMN_NAME = 'booking_source');
SET @sql_bs_stay = IF(@col_bs_stay = 0, 'ALTER TABLE stays ADD COLUMN booking_source VARCHAR(50) NULL DEFAULT \'Social Media\' AFTER checkout_time', 'SELECT 1');
PREPARE stmt_bs_stay FROM @sql_bs_stay;
EXECUTE stmt_bs_stay;
DEALLOCATE PREPARE stmt_bs_stay;

SET @col_ref_stay = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stays' AND COLUMN_NAME = 'referred_by_guest_id');
SET @sql_ref_stay = IF(@col_ref_stay = 0, 'ALTER TABLE stays ADD COLUMN referred_by_guest_id INT UNSIGNED NULL AFTER booking_source', 'SELECT 1');
PREPARE stmt_ref_stay FROM @sql_ref_stay;
EXECUTE stmt_ref_stay;
DEALLOCATE PREPARE stmt_ref_stay;

SET @col_oth_stay = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stays' AND COLUMN_NAME = 'other_source');
SET @sql_oth_stay = IF(@col_oth_stay = 0, 'ALTER TABLE stays ADD COLUMN other_source VARCHAR(150) NULL AFTER referred_by_guest_id', 'SELECT 1');
PREPARE stmt_oth_stay FROM @sql_oth_stay;
EXECUTE stmt_oth_stay;
DEALLOCATE PREPARE stmt_oth_stay;
