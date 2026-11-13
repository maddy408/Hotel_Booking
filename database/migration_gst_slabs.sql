-- Tamarind Court Hotel Management System
-- Migration: Room-Type-Wise GST Slabs & Inter-state IGST Support
USE tamarind_court;

-- 1. Ensure settings table has extra charges GST rates
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'extra_food_gst_rate';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE settings
    ADD COLUMN extra_food_gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0500 AFTER tax_extras,
    ADD COLUMN extra_laundry_gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1800 AFTER extra_food_gst_rate,
    ADD COLUMN extra_bed_gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0500 AFTER extra_laundry_gst_rate,
    ADD COLUMN extra_taxi_gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0500 AFTER extra_bed_gst_rate,
    ADD COLUMN extra_other_gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.1800 AFTER extra_taxi_gst_rate',
  'SELECT "extra charge columns already exist in settings"');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- 2. Update default GST slabs to 5% (up to 7,500) and 18% (above 7,500)
UPDATE settings
SET
  gst_slab1_max_rate = 7500.00,
  gst_slab1_gst_rate = 0.0500,
  gst_slab2_max_rate = 7500.00,
  gst_slab2_gst_rate = 0.1800,
  gst_slab3_gst_rate = 0.1800
WHERE hotel_id = 1;

-- 3. Ensure invoices table has igst_amount column
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'igst_amount';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE invoices ADD COLUMN igst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER sgst_amount',
  'SELECT "igst_amount already exists in invoices"');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- 4. Ensure reservations table stores locked GST calculation
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reservations' AND COLUMN_NAME = 'gst_rate';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE reservations
    ADD COLUMN gst_rate DECIMAL(5,4) NULL AFTER rate,
    ADD COLUMN tax_amount DECIMAL(10,2) NULL AFTER gst_rate,
    ADD COLUMN total_amount DECIMAL(10,2) NULL AFTER tax_amount',
  'SELECT "gst columns already exist in reservations"');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- 5. Ensure stays table stores locked room GST rate and amount
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stays' AND COLUMN_NAME = 'gst_rate';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE stays
    ADD COLUMN gst_rate DECIMAL(5,4) NULL AFTER rate,
    ADD COLUMN room_gst_amount DECIMAL(10,2) NULL AFTER gst_rate',
  'SELECT "gst columns already exist in stays"');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

-- 6. Ensure stay_charges table stores category, SAC, and tax
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stay_charges' AND COLUMN_NAME = 'tax_category';

SET @stmt = IF(@col_exists = 0,
  'ALTER TABLE stay_charges
    ADD COLUMN tax_category VARCHAR(50) NULL AFTER label,
    ADD COLUMN sac_code VARCHAR(10) NULL AFTER tax_category,
    ADD COLUMN gst_rate DECIMAL(5,4) NOT NULL DEFAULT 0.0000 AFTER sac_code,
    ADD COLUMN gst_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER gst_rate',
  'SELECT "tax columns already exist in stay_charges"');
PREPARE exec_sql FROM @stmt;
EXECUTE exec_sql;
DEALLOCATE PREPARE exec_sql;

