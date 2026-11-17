<?php

declare(strict_types=1);

namespace App\Database;

use PDO;

final class SchemaManager
{
    private static bool $ensured = false;

    /**
     * Ensures required table columns exist in MySQL without modifying data or dropping tables.
     */
    public static function ensureColumns(PDO $db): void
    {
        if (self::$ensured) {
            return;
        }

        try {
            $cols = self::getColumns($db, 'guests');
            if ($cols !== null) {
                if (!in_array('email', $cols, true)) {
                    $db->exec('ALTER TABLE guests ADD COLUMN email VARCHAR(150) NULL AFTER phone');
                }
                if (!in_array('address', $cols, true)) {
                    $db->exec('ALTER TABLE guests ADD COLUMN address VARCHAR(255) NULL AFTER city');
                }
            }

            $resCols = self::getColumns($db, 'reservations');
            if ($resCols !== null) {
                if (!in_array('check_out_time', $resCols, true)) {
                    $db->exec("ALTER TABLE reservations ADD COLUMN check_out_time TIME NOT NULL DEFAULT '12:00:00' AFTER check_out_date");
                }
                if (!in_array('notes', $resCols, true)) {
                    $db->exec('ALTER TABLE reservations ADD COLUMN notes VARCHAR(255) NULL AFTER advance_method');
                }
                if (!in_array('booking_source', $resCols, true)) {
                    $db->exec("ALTER TABLE reservations ADD COLUMN booking_source VARCHAR(50) NULL DEFAULT 'Social Media' AFTER notes");
                }
                if (!in_array('referred_by_guest_id', $resCols, true)) {
                    $db->exec('ALTER TABLE reservations ADD COLUMN referred_by_guest_id INT UNSIGNED NULL AFTER booking_source');
                    try {
                        $db->exec('ALTER TABLE reservations ADD CONSTRAINT fk_reservations_referred_by FOREIGN KEY (referred_by_guest_id) REFERENCES guests(id) ON DELETE SET NULL');
                    } catch (\Throwable) {}
                }
                if (!in_array('other_source', $resCols, true)) {
                    $db->exec('ALTER TABLE reservations ADD COLUMN other_source VARCHAR(150) NULL AFTER referred_by_guest_id');
                }
            }

            $stayCols = self::getColumns($db, 'stays');
            if ($stayCols !== null) {
                if (!in_array('checkout_time', $stayCols, true)) {
                    $db->exec("ALTER TABLE stays ADD COLUMN checkout_time TIME NOT NULL DEFAULT '12:00:00' AFTER checkout_planned");
                }
                if (!in_array('booking_source', $stayCols, true)) {
                    $db->exec("ALTER TABLE stays ADD COLUMN booking_source VARCHAR(50) NULL DEFAULT 'Social Media' AFTER checkout_time");
                }
                if (!in_array('referred_by_guest_id', $stayCols, true)) {
                    $db->exec('ALTER TABLE stays ADD COLUMN referred_by_guest_id INT UNSIGNED NULL AFTER booking_source');
                    try {
                        $db->exec('ALTER TABLE stays ADD CONSTRAINT fk_stays_referred_by FOREIGN KEY (referred_by_guest_id) REFERENCES guests(id) ON DELETE SET NULL');
                    } catch (\Throwable) {}
                }
                if (!in_array('other_source', $stayCols, true)) {
                    $db->exec('ALTER TABLE stays ADD COLUMN other_source VARCHAR(150) NULL AFTER referred_by_guest_id');
                }
            }

            $settingsCols = self::getColumns($db, 'settings');
            if ($settingsCols !== null) {
                if (!in_array('whatsapp_checkin_template', $settingsCols, true)) {
                    $db->exec('ALTER TABLE settings ADD COLUMN whatsapp_checkin_template TEXT NULL AFTER whatsapp_checkout_template');
                }
                if (!in_array('whatsapp_checkin_enabled', $settingsCols, true)) {
                    $db->exec('ALTER TABLE settings ADD COLUMN whatsapp_checkin_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER whatsapp_checkin_template');
                }
            }

            // Ensure occupants and occupant_documents tables exist
            $db->exec("CREATE TABLE IF NOT EXISTS occupants (
              id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
              hotel_id         INT UNSIGNED      NOT NULL,
              stay_id          INT UNSIGNED      NOT NULL,
              occupant_number  INT UNSIGNED      NOT NULL DEFAULT 1,
              name             VARCHAR(150)      NULL,
              gender           VARCHAR(20)       NULL,
              phone            VARCHAR(30)       NULL,
              is_primary       TINYINT(1)        NOT NULL DEFAULT 0,
              guest_id         INT UNSIGNED      NULL,
              created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY ix_occupants_stay (hotel_id, stay_id),
              KEY ix_occupants_guest (guest_id),
              CONSTRAINT fk_occupants_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
              CONSTRAINT fk_occupants_stay  FOREIGN KEY (stay_id)  REFERENCES stays(id)  ON DELETE CASCADE,
              CONSTRAINT fk_occupants_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL
            ) ENGINE=InnoDB;");

            $occCols = self::getColumns($db, 'occupants');
            if ($occCols !== null) {
                if (!in_array('gender', $occCols, true)) {
                    $db->exec('ALTER TABLE occupants ADD COLUMN gender VARCHAR(20) NULL AFTER name');
                }
                if (!in_array('phone', $occCols, true)) {
                    $db->exec('ALTER TABLE occupants ADD COLUMN phone VARCHAR(30) NULL AFTER gender');
                }
            }

            $db->exec("CREATE TABLE IF NOT EXISTS occupant_documents (
              id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
              hotel_id          INT UNSIGNED      NOT NULL,
              reservation_id    INT UNSIGNED      NULL,
              stay_id           INT UNSIGNED      NULL,
              occupant_id       INT UNSIGNED      NULL,
              file_path         VARCHAR(255)      NOT NULL,
              original_filename VARCHAR(255)      NOT NULL,
              mime_type         VARCHAR(100)      NOT NULL,
              file_size         INT UNSIGNED      NOT NULL,
              uploaded_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY ix_occupant_documents_reservation (reservation_id),
              KEY ix_occupant_documents_stay (stay_id),
              KEY ix_occupant_documents_occupant (occupant_id),
              KEY ix_occupant_documents_hotel (hotel_id),
              CONSTRAINT fk_occupant_documents_hotel       FOREIGN KEY (hotel_id)       REFERENCES hotels(id)       ON DELETE CASCADE,
              CONSTRAINT fk_occupant_documents_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
              CONSTRAINT fk_occupant_documents_stay        FOREIGN KEY (stay_id)        REFERENCES stays(id)        ON DELETE CASCADE,
              CONSTRAINT fk_occupant_documents_occupant    FOREIGN KEY (occupant_id)    REFERENCES occupants(id)    ON DELETE SET NULL
            ) ENGINE=InnoDB;");

            try {
                $db->exec("CREATE OR REPLACE VIEW occupants_documents AS SELECT * FROM occupant_documents;");
            } catch (\Throwable) {}

            $docCols = self::getColumns($db, 'occupant_documents');
            if ($docCols !== null) {
                if (!in_array('reservation_id', $docCols, true)) {
                    $db->exec('ALTER TABLE occupant_documents ADD COLUMN reservation_id INT UNSIGNED NULL AFTER hotel_id');
                    try {
                        $db->exec('ALTER TABLE occupant_documents ADD KEY ix_occupant_documents_reservation (reservation_id)');
                        $db->exec('ALTER TABLE occupant_documents ADD CONSTRAINT fk_occupant_documents_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE');
                    } catch (\Throwable) {}
                }
                if (!in_array('stay_id', $docCols, true)) {
                    $db->exec('ALTER TABLE occupant_documents ADD COLUMN stay_id INT UNSIGNED NULL AFTER reservation_id');
                    try {
                        $db->exec('ALTER TABLE occupant_documents ADD KEY ix_occupant_documents_stay (stay_id)');
                        $db->exec('ALTER TABLE occupant_documents ADD CONSTRAINT fk_occupant_documents_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE');
                    } catch (\Throwable) {}
                }
                try {
                    $db->exec('ALTER TABLE occupant_documents MODIFY COLUMN occupant_id INT UNSIGNED NULL');
                } catch (\Throwable) {}
                try {
                    $db->exec('UPDATE occupant_documents od JOIN occupants o ON o.id = od.occupant_id SET od.stay_id = o.stay_id WHERE od.stay_id IS NULL');
                } catch (\Throwable) {}
                try {
                    $db->exec('UPDATE occupant_documents od JOIN stays s ON s.id = od.stay_id SET od.reservation_id = s.reservation_id WHERE od.reservation_id IS NULL AND s.reservation_id IS NOT NULL');
                } catch (\Throwable) {}
            }
        } catch (\Throwable $e) {
            error_log('[tamarind-court] Schema check warning: ' . $e->getMessage());
        }

        self::$ensured = true;
    }

    /** @return array<int,string>|null */
    private static function getColumns(PDO $db, string $table): ?array
    {
        try {
            $stmt = $db->prepare(
                'SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tbl'
            );
            $stmt->execute(['tbl' => $table]);
            $list = $stmt->fetchAll(PDO::FETCH_COLUMN);
            return is_array($list) ? $list : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
