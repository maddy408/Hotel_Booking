-- Tamarind Court: Complete Edit Functionality Migration
-- Adds email and address to guests table, and notes to reservations table.
USE tamarind_court;

-- Add email and address to guests if they don't already exist
SET @col_email_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND COLUMN_NAME = 'email'
);
SET @sql_add_email = IF(@col_email_exists = 0, 'ALTER TABLE guests ADD COLUMN email VARCHAR(150) NULL AFTER phone', 'SELECT 1');
PREPARE stmt_add_email FROM @sql_add_email;
EXECUTE stmt_add_email;
DEALLOCATE PREPARE stmt_add_email;

SET @col_address_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'guests' AND COLUMN_NAME = 'address'
);
SET @sql_add_address = IF(@col_address_exists = 0, 'ALTER TABLE guests ADD COLUMN address VARCHAR(255) NULL AFTER city', 'SELECT 1');
PREPARE stmt_add_address FROM @sql_add_address;
EXECUTE stmt_add_address;
DEALLOCATE PREPARE stmt_add_address;

-- Add notes to reservations if it doesn't already exist
SET @col_notes_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'notes'
);
SET @sql_add_notes = IF(@col_notes_exists = 0, 'ALTER TABLE reservations ADD COLUMN notes VARCHAR(255) NULL AFTER advance_method', 'SELECT 1');
PREPARE stmt_add_notes FROM @sql_add_notes;
EXECUTE stmt_add_notes;
DEALLOCATE PREPARE stmt_add_notes;

