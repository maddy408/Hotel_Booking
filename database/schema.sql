-- Tamarind Court Front Desk — schema
-- MySQL/MariaDB, InnoDB, utf8mb4. Run before seed.sql.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS tamarind_court CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tamarind_court;

-- ---------------------------------------------------------------------------
-- hotels / settings
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS hotels;
CREATE TABLE hotels (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  name          VARCHAR(150)       NOT NULL,
  place         VARCHAR(150)       NULL,
  address       VARCHAR(255)       NULL,
  gstin         VARCHAR(15)        NULL,
  phone         VARCHAR(15)        NULL,
  email         VARCHAR(150)       NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS settings;
CREATE TABLE settings (
  id                        INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id                  INT UNSIGNED      NOT NULL,
  -- GST slabs (hotel room tariff, per night, in rupees) -> rate as decimal fraction (0.05 = 5%)
  gst_slab1_max_rate        DECIMAL(10,2)     NOT NULL DEFAULT 1000.00,
  gst_slab1_gst_rate        DECIMAL(5,4)      NOT NULL DEFAULT 0.0000,
  gst_slab2_max_rate        DECIMAL(10,2)     NOT NULL DEFAULT 7500.00,
  gst_slab2_gst_rate        DECIMAL(5,4)      NOT NULL DEFAULT 0.0500,
  gst_slab3_gst_rate        DECIMAL(5,4)      NOT NULL DEFAULT 0.1800,
  tax_extras                TINYINT(1)        NOT NULL DEFAULT 0,
  checkout_hour             TINYINT UNSIGNED  NOT NULL DEFAULT 12,
  currency                  VARCHAR(5)        NOT NULL DEFAULT 'INR',
  financial_year_start_month TINYINT UNSIGNED NOT NULL DEFAULT 4,
  invoice_prefix            VARCHAR(10)       NOT NULL DEFAULT 'INV',
  booking_prefix            VARCHAR(10)       NOT NULL DEFAULT 'BK',
  created_at                DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_hotel (hotel_id),
  CONSTRAINT fk_settings_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- roles / users / refresh_tokens / login_attempts
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id            TINYINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  code          VARCHAR(30)        NOT NULL,
  name          VARCHAR(50)        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB;

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  hotel_id      INT UNSIGNED       NOT NULL,
  role_id       TINYINT UNSIGNED   NOT NULL,
  name          VARCHAR(100)       NOT NULL,
  username      VARCHAR(50)        NOT NULL,
  email         VARCHAR(150)       NULL,
  phone         VARCHAR(15)        NULL,
  password_hash VARCHAR(255)       NOT NULL,
  is_active     TINYINT(1)         NOT NULL DEFAULT 1,
  last_login_at DATETIME           NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY ix_users_hotel (hotel_id),
  CONSTRAINT fk_users_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_users_role  FOREIGN KEY (role_id)  REFERENCES roles(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;

DROP TABLE IF EXISTS refresh_tokens;
CREATE TABLE refresh_tokens (
  id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED       NOT NULL,
  token_hash    VARCHAR(255)       NOT NULL,
  expires_at    DATETIME           NOT NULL,
  revoked_at    DATETIME           NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY ix_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS login_attempts;
CREATE TABLE login_attempts (
  id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)        NOT NULL,
  ip_address    VARCHAR(45)        NOT NULL,
  success       TINYINT(1)         NOT NULL DEFAULT 0,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_login_attempts_lookup (username, ip_address, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- room_types / rooms
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS room_types;
CREATE TABLE room_types (
  id            INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  hotel_id      INT UNSIGNED       NOT NULL,
  code          VARCHAR(20)        NOT NULL,
  name          VARCHAR(100)       NOT NULL,
  rate          DECIMAL(10,2)      NOT NULL,
  max_persons   TINYINT UNSIGNED   NOT NULL DEFAULT 2,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_types_hotel_code (hotel_id, code),
  CONSTRAINT fk_room_types_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TABLE IF EXISTS rooms;
CREATE TABLE rooms (
  id                   INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  hotel_id             INT UNSIGNED       NOT NULL,
  room_no              INT UNSIGNED       NOT NULL,
  floor                TINYINT UNSIGNED   NOT NULL DEFAULT 0,
  room_type_id         INT UNSIGNED       NOT NULL,
  housekeeping_status  ENUM('ok','cleaning','repair') NOT NULL DEFAULT 'ok',
  note                 VARCHAR(255)       NULL,
  created_at           DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_hotel_no (hotel_id, room_no),
  KEY ix_rooms_type (room_type_id),
  CONSTRAINT fk_rooms_hotel FOREIGN KEY (hotel_id)      REFERENCES hotels(id)     ON DELETE CASCADE,
  CONSTRAINT fk_rooms_type  FOREIGN KEY (room_type_id)  REFERENCES room_types(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- guests
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS guests;
CREATE TABLE guests (
  id                    INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id              INT UNSIGNED      NOT NULL,
  name                  VARCHAR(150)      NOT NULL,
  phone                 VARCHAR(15)       NOT NULL,
  id_proof_type         ENUM('Aadhaar','Driving Licence','Voter ID','Passport','Other') NOT NULL DEFAULT 'Aadhaar',
  id_proof_number_enc   VARBINARY(512)    NULL,      -- full ID number, encrypted at the app layer (AES-256-GCM)
  id_proof_last4        CHAR(4)           NULL,      -- derived, used for masked display without decrypting
  city                  VARCHAR(100)      NULL,
  is_foreign            TINYINT(1)        NOT NULL DEFAULT 0,
  nationality           VARCHAR(100)      NULL,
  passport_number_enc   VARBINARY(512)    NULL,
  visa_number_enc       VARBINARY(512)    NULL,
  visa_expiry           DATE              NULL,
  id_image_path         VARCHAR(255)      NULL,
  created_at            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_guests_phone (hotel_id, phone),
  KEY ix_guests_name (name),
  CONSTRAINT fk_guests_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- reservations (bookings made ahead of arrival)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS reservations;
CREATE TABLE reservations (
  id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id          INT UNSIGNED      NOT NULL,
  booking_code      VARCHAR(20)       NOT NULL,
  room_id           INT UNSIGNED      NOT NULL,
  guest_id          INT UNSIGNED      NOT NULL,
  check_in_date     DATE              NOT NULL,
  check_out_date    DATE              NOT NULL,
  persons           TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  rate              DECIMAL(10,2)     NOT NULL,
  advance_amount    DECIMAL(10,2)     NOT NULL DEFAULT 0.00,
  advance_method    ENUM('cash','upi','card') NOT NULL DEFAULT 'cash',
  status            ENUM('pending','checked_in','cancelled','no_show') NOT NULL DEFAULT 'pending',
  created_by        INT UNSIGNED      NULL,
  cancelled_at      DATETIME          NULL,
  cancel_reason     VARCHAR(255)      NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reservations_code (booking_code),
  KEY ix_reservations_room_dates (room_id, status, check_in_date, check_out_date),
  KEY ix_reservations_guest (guest_id),
  CONSTRAINT fk_reservations_hotel  FOREIGN KEY (hotel_id)   REFERENCES hotels(id)  ON DELETE CASCADE,
  CONSTRAINT fk_reservations_room   FOREIGN KEY (room_id)    REFERENCES rooms(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_guest  FOREIGN KEY (guest_id)   REFERENCES guests(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_user   FOREIGN KEY (created_by) REFERENCES users(id)   ON DELETE SET NULL,
  CONSTRAINT chk_reservations_dates CHECK (check_out_date > check_in_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- stays (actual check-ins, in-house or finished)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS stays;
CREATE TABLE stays (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id            INT UNSIGNED      NOT NULL,
  reservation_id       INT UNSIGNED      NULL,       -- set if this stay originated from a booking
  room_id              INT UNSIGNED      NOT NULL,
  guest_id             INT UNSIGNED      NOT NULL,
  persons              TINYINT UNSIGNED  NOT NULL DEFAULT 1,
  rate                 DECIMAL(10,2)     NOT NULL,     -- snapshotted at check-in time
  check_in_date        DATE              NOT NULL,     -- actual arrival date
  checkout_planned     DATE              NOT NULL,
  checkout_actual      DATE              NULL,
  status               ENUM('in_house','checked_out','cancelled') NOT NULL DEFAULT 'in_house',
  payment_method       ENUM('cash','upi','card') NOT NULL DEFAULT 'cash', -- method of checkout settlement
  created_by           INT UNSIGNED      NULL,
  created_at           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_stays_room_status (room_id, status),
  KEY ix_stays_guest (guest_id),
  KEY ix_stays_reservation (reservation_id),
  CONSTRAINT fk_stays_hotel       FOREIGN KEY (hotel_id)       REFERENCES hotels(id)       ON DELETE CASCADE,
  CONSTRAINT fk_stays_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_stays_room        FOREIGN KEY (room_id)        REFERENCES rooms(id)        ON DELETE RESTRICT,
  CONSTRAINT fk_stays_guest       FOREIGN KEY (guest_id)       REFERENCES guests(id)       ON DELETE RESTRICT,
  CONSTRAINT fk_stays_user        FOREIGN KEY (created_by)     REFERENCES users(id)        ON DELETE SET NULL,
  CONSTRAINT chk_stays_dates      CHECK (checkout_planned > check_in_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- stay_charges (extras added during a stay)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS stay_charges;
CREATE TABLE stay_charges (
  id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
  stay_id       INT UNSIGNED       NOT NULL,
  label         VARCHAR(100)       NOT NULL,
  amount        DECIMAL(10,2)      NOT NULL,
  is_taxable    TINYINT(1)         NOT NULL DEFAULT 0,
  added_by      INT UNSIGNED       NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_stay_charges_stay (stay_id),
  CONSTRAINT fk_stay_charges_stay FOREIGN KEY (stay_id)  REFERENCES stays(id) ON DELETE CASCADE,
  CONSTRAINT fk_stay_charges_user FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- payments (advance, balance, refund — multiple per stay/reservation)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS payments;
CREATE TABLE payments (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  hotel_id        INT UNSIGNED     NOT NULL,
  reservation_id  INT UNSIGNED     NULL,
  stay_id         INT UNSIGNED     NULL,
  type            ENUM('advance','balance','refund','extra') NOT NULL,
  amount          DECIMAL(10,2)    NOT NULL,
  method          ENUM('cash','upi','card') NOT NULL,
  received_by     INT UNSIGNED     NULL,
  note            VARCHAR(255)     NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_payments_reservation (reservation_id),
  KEY ix_payments_stay (stay_id),
  CONSTRAINT fk_payments_hotel       FOREIGN KEY (hotel_id)       REFERENCES hotels(id)       ON DELETE CASCADE,
  CONSTRAINT fk_payments_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_stay        FOREIGN KEY (stay_id)        REFERENCES stays(id)        ON DELETE CASCADE,
  CONSTRAINT fk_payments_user        FOREIGN KEY (received_by)    REFERENCES users(id)        ON DELETE SET NULL,
  CONSTRAINT chk_payments_target     CHECK (reservation_id IS NOT NULL OR stay_id IS NOT NULL)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- invoices (sequential GST invoice per financial year, one per completed stay)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS invoices;
CREATE TABLE invoices (
  id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  hotel_id           INT UNSIGNED     NOT NULL,
  stay_id            INT UNSIGNED     NOT NULL,
  invoice_number     VARCHAR(30)      NOT NULL,
  financial_year     VARCHAR(7)       NOT NULL,   -- e.g. '2025-26'
  sequence_no        INT UNSIGNED     NOT NULL,    -- running number within the financial year
  guest_gstin        VARCHAR(15)      NULL,
  room_amount        DECIMAL(10,2)    NOT NULL,
  gst_rate           DECIMAL(5,4)     NOT NULL,
  room_gst_amount    DECIMAL(10,2)    NOT NULL,
  extras_amount      DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  extras_gst_amount  DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  cgst_amount        DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  sgst_amount        DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  total_amount       DECIMAL(10,2)    NOT NULL,
  advance_paid       DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  balance_amount     DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoices_number (invoice_number),
  UNIQUE KEY uq_invoices_stay (stay_id),
  KEY ix_invoices_fy_seq (hotel_id, financial_year, sequence_no),
  CONSTRAINT fk_invoices_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_stay  FOREIGN KEY (stay_id)  REFERENCES stays(id)  ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- housekeeping_logs
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS housekeeping_logs;
CREATE TABLE housekeeping_logs (
  id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
  room_id       INT UNSIGNED       NOT NULL,
  action        ENUM('ready','cleaning','repair') NOT NULL,
  note          VARCHAR(255)       NULL,
  changed_by    INT UNSIGNED       NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_hk_logs_room (room_id),
  CONSTRAINT fk_hk_logs_room FOREIGN KEY (room_id)    REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_hk_logs_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED    NOT NULL AUTO_INCREMENT,
  hotel_id      INT UNSIGNED       NOT NULL,
  user_id       INT UNSIGNED       NULL,
  action        VARCHAR(50)        NOT NULL,     -- e.g. 'check_in','check_out','cancel','rate_change','room_delete'
  entity_type   VARCHAR(50)        NOT NULL,     -- e.g. 'stay','reservation','room','room_type'
  entity_id     INT UNSIGNED       NULL,
  before_json   JSON               NULL,
  after_json    JSON               NULL,
  ip_address    VARCHAR(45)        NULL,
  created_at    DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_logs_entity (entity_type, entity_id),
  KEY ix_audit_logs_hotel_date (hotel_id, created_at),
  CONSTRAINT fk_audit_logs_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_logs_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
