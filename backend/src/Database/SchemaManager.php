<?php

declare(strict_types=1);

namespace App\Database;

use PDO;

final class SchemaManager
{
    private static bool $ensured = false;

    /**
     * Ensures required table columns and nullability exist in MySQL without modifying data or dropping tables.
     */
    public static function ensureColumns(PDO $db): void
    {
        if (self::$ensured) {
            return;
        }

        try {
            $meta = self::getSchemaMetadata($db);
            if ($meta === null) {
                self::$ensured = true;
                return;
            }

            // 1. guests
            if (isset($meta['guests'])) {
                $guests = $meta['guests'];
                if (isset($guests['id_proof_type']) && strtoupper((string) $guests['id_proof_type']['nullable']) === 'NO') {
                    try {
                        $db->exec("ALTER TABLE guests MODIFY COLUMN id_proof_type ENUM('Aadhaar','Driving Licence','Voter ID','Passport','Other') NULL DEFAULT NULL");
                    } catch (\Throwable) {}
                }
                self::addColumnsIfMissing($db, 'guests', $guests, [
                    'email' => 'VARCHAR(150) NULL',
                    'address' => 'VARCHAR(255) NULL',
                    'is_foreign' => 'TINYINT(1) NOT NULL DEFAULT 0',
                    'nationality' => 'VARCHAR(100) NULL',
                    'passport_number_enc' => 'VARBINARY(512) NULL',
                    'visa_number_enc' => 'VARBINARY(512) NULL',
                    'visa_expiry' => 'DATE NULL',
                    'id_image_path' => 'VARCHAR(255) NULL',
                ]);
            }

            // 2. settings
            if (isset($meta['settings'])) {
                self::addColumnsIfMissing($db, 'settings', $meta['settings'], [
                    'extra_food_gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.0500',
                    'extra_laundry_gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.1800',
                    'extra_bed_gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.0500',
                    'extra_taxi_gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.0500',
                    'extra_other_gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.1800',
                    'whatsapp_checkin_template' => 'TEXT NULL',
                    'whatsapp_checkin_enabled' => 'TINYINT(1) NOT NULL DEFAULT 1',
                    'cancellation_deadline_hours' => 'INT UNSIGNED NOT NULL DEFAULT 24',
                    'cancellation_free_allowed' => 'TINYINT(1) NOT NULL DEFAULT 1',
                    'cancellation_fee_type' => "ENUM('none', 'fixed', 'percentage', 'first_night') NOT NULL DEFAULT 'none'",
                    'cancellation_fee_value' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'cancellation_late_fee_type' => "ENUM('none', 'fixed', 'percentage', 'first_night') NOT NULL DEFAULT 'percentage'",
                    'cancellation_late_fee_value' => 'DECIMAL(10,2) NOT NULL DEFAULT 10.00',
                    'early_checkout_refund_unused_nights' => 'TINYINT(1) NOT NULL DEFAULT 1',
                    'early_checkout_fee_type' => "ENUM('none', 'fixed', 'percentage', 'one_night') NOT NULL DEFAULT 'none'",
                    'early_checkout_fee_value' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                ]);
            }

            // 3. reservations
            if (isset($meta['reservations'])) {
                $res = $meta['reservations'];
                self::addColumnsIfMissing($db, 'reservations', $res, [
                    'check_out_time' => "TIME NOT NULL DEFAULT '12:00:00'",
                    'gst_rate' => 'DECIMAL(5,4) NULL',
                    'tax_amount' => 'DECIMAL(10,2) NULL',
                    'total_amount' => 'DECIMAL(10,2) NULL',
                    'notes' => 'VARCHAR(255) NULL',
                    'booking_source' => "VARCHAR(50) NULL DEFAULT 'Social Media'",
                    'referred_by_guest_id' => 'INT UNSIGNED NULL',
                    'other_source' => 'VARCHAR(150) NULL',
                    'cancellation_fee' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'refundable_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'cancelled_by' => 'INT UNSIGNED NULL',
                ], [
                    'referred_by_guest_id' => 'ALTER TABLE reservations ADD CONSTRAINT fk_reservations_referred_by FOREIGN KEY (referred_by_guest_id) REFERENCES guests(id) ON DELETE SET NULL',
                    'cancelled_by' => 'ALTER TABLE reservations ADD CONSTRAINT fk_reservations_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL',
                ]);

                $statusType = (string) ($res['status']['type'] ?? '');
                if ($statusType !== '' && !str_contains($statusType, 'checked_out')) {
                    try {
                        $db->exec("ALTER TABLE reservations MODIFY COLUMN status ENUM('pending','checked_in','checked_out','cancelled','no_show') NOT NULL DEFAULT 'pending'");
                        $db->exec("UPDATE reservations r JOIN stays s ON s.reservation_id = r.id SET r.status = 'checked_out' WHERE r.status = 'checked_in' AND s.status = 'checked_out'");
                        $db->exec("UPDATE reservations r LEFT JOIN stays s ON s.reservation_id = r.id AND s.status = 'in_house' SET r.status = 'checked_out' WHERE r.status = 'checked_in' AND s.id IS NULL");
                    } catch (\Throwable) {}
                }

                if (!isset($res['active_checked_in_room_id'])) {
                    try {
                        $db->exec("ALTER TABLE reservations ADD COLUMN active_checked_in_room_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'checked_in' THEN room_id ELSE NULL END) VIRTUAL");
                        $db->exec('ALTER TABLE reservations ADD UNIQUE KEY uq_reservations_active_room (active_checked_in_room_id)');
                    } catch (\Throwable) {}
                }
            }

            // 4. stays
            if (isset($meta['stays'])) {
                $stays = $meta['stays'];
                self::addColumnsIfMissing($db, 'stays', $stays, [
                    'gst_rate' => 'DECIMAL(5,4) NULL',
                    'room_gst_amount' => 'DECIMAL(10,2) NULL',
                    'checkout_time' => "TIME NOT NULL DEFAULT '12:00:00'",
                    'booking_source' => "VARCHAR(50) NULL DEFAULT 'Social Media'",
                    'referred_by_guest_id' => 'INT UNSIGNED NULL',
                    'other_source' => 'VARCHAR(150) NULL',
                    'discount_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'discount_reason' => 'VARCHAR(255) NULL',
                    'early_checkout_fee' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                ], [
                    'referred_by_guest_id' => 'ALTER TABLE stays ADD CONSTRAINT fk_stays_referred_by FOREIGN KEY (referred_by_guest_id) REFERENCES guests(id) ON DELETE SET NULL',
                ]);

                if (!isset($stays['active_room_id'])) {
                    try {
                        $db->exec("ALTER TABLE stays ADD COLUMN active_room_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'in_house' THEN room_id ELSE NULL END) VIRTUAL");
                        $db->exec('ALTER TABLE stays ADD UNIQUE KEY uq_stays_active_room (active_room_id)');
                    } catch (\Throwable) {}
                }
            }

            // 5. stay_charges
            if (isset($meta['stay_charges'])) {
                self::addColumnsIfMissing($db, 'stay_charges', $meta['stay_charges'], [
                    'tax_category' => 'VARCHAR(50) NULL',
                    'sac_code' => 'VARCHAR(10) NULL',
                    'gst_rate' => 'DECIMAL(5,4) NOT NULL DEFAULT 0.0000',
                    'gst_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                ]);
            }

            // 6. invoices
            if (isset($meta['invoices'])) {
                self::addColumnsIfMissing($db, 'invoices', $meta['invoices'], [
                    'igst_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'discount_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'early_checkout_fee' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                    'refund_amount' => 'DECIMAL(10,2) NOT NULL DEFAULT 0.00',
                ]);
            }

            // 7. payments
            if (isset($meta['payments'])) {
                self::addColumnsIfMissing($db, 'payments', $meta['payments'], [
                    'parent_payment_id' => 'BIGINT UNSIGNED NULL',
                    'status' => "ENUM('successful','pending','failed') NOT NULL DEFAULT 'successful'",
                    'reason' => 'VARCHAR(255) NULL',
                ], [
                    'parent_payment_id' => [
                        'ALTER TABLE payments ADD KEY ix_payments_parent (parent_payment_id)',
                        'ALTER TABLE payments ADD CONSTRAINT fk_payments_parent FOREIGN KEY (parent_payment_id) REFERENCES payments(id) ON DELETE SET NULL',
                    ],
                ]);
            }

            // 8. occupants & occupant_documents
            if (!isset($meta['occupants'])) {
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
            } else {
                self::addColumnsIfMissing($db, 'occupants', $meta['occupants'], [
                    'gender' => 'VARCHAR(20) NULL',
                    'phone' => 'VARCHAR(30) NULL',
                ]);
            }

            if (!isset($meta['occupant_documents'])) {
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
            } else {
                $docCols = $meta['occupant_documents'];
                self::addColumnsIfMissing($db, 'occupant_documents', $docCols, [
                    'reservation_id' => 'INT UNSIGNED NULL',
                    'stay_id' => 'INT UNSIGNED NULL',
                ], [
                    'reservation_id' => [
                        'ALTER TABLE occupant_documents ADD KEY ix_occupant_documents_reservation (reservation_id)',
                        'ALTER TABLE occupant_documents ADD CONSTRAINT fk_occupant_documents_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE',
                    ],
                    'stay_id' => [
                        'ALTER TABLE occupant_documents ADD KEY ix_occupant_documents_stay (stay_id)',
                        'ALTER TABLE occupant_documents ADD CONSTRAINT fk_occupant_documents_stay FOREIGN KEY (stay_id) REFERENCES stays(id) ON DELETE CASCADE',
                    ],
                ]);
                if (isset($docCols['occupant_id']) && strtoupper((string) $docCols['occupant_id']['nullable']) === 'NO') {
                    try {
                        $db->exec('ALTER TABLE occupant_documents MODIFY COLUMN occupant_id INT UNSIGNED NULL');
                        $db->exec('UPDATE occupant_documents od JOIN occupants o ON o.id = od.occupant_id SET od.stay_id = o.stay_id WHERE od.stay_id IS NULL');
                        $db->exec('UPDATE occupant_documents od JOIN stays s ON s.id = od.stay_id SET od.reservation_id = s.reservation_id WHERE od.reservation_id IS NULL AND s.reservation_id IS NOT NULL');
                    } catch (\Throwable) {}
                }
            }

            if (!isset($meta['occupants_documents'])) {
                try {
                    $db->exec('CREATE OR REPLACE VIEW occupants_documents AS SELECT * FROM occupant_documents;');
                } catch (\Throwable) {}
            }
        } catch (\Throwable $e) {
            error_log('[tamarind-court] Schema check warning: ' . $e->getMessage());
        }

        self::$ensured = true;
    }

    /**
     * @param array<string,array{nullable:string,type:string}> $existingCols
     * @param array<string,string> $definitions
     * @param array<string,string|array<int,string>> $postStatements
     */
    private static function addColumnsIfMissing(
        PDO $db,
        string $table,
        array $existingCols,
        array $definitions,
        array $postStatements = []
    ): void {
        foreach ($definitions as $col => $ddl) {
            if (isset($existingCols[$col])) {
                continue;
            }
            $db->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$ddl}");
            if (isset($postStatements[$col])) {
                $stmts = is_array($postStatements[$col]) ? $postStatements[$col] : [$postStatements[$col]];
                foreach ($stmts as $sql) {
                    try {
                        $db->exec($sql);
                    } catch (\Throwable) {}
                }
            }
        }
    }

    /** @return array<string,array<string,array{nullable:string,type:string}>>|null */
    private static function getSchemaMetadata(PDO $db): ?array
    {
        try {
            $stmt = $db->query(
                'SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE()'
            );
            $meta = [];
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $tbl = (string) $row['TABLE_NAME'];
                $col = (string) $row['COLUMN_NAME'];
                $meta[$tbl][$col] = [
                    'nullable' => (string) $row['IS_NULLABLE'],
                    'type' => (string) $row['COLUMN_TYPE'],
                ];
            }
            return $meta;
        } catch (\Throwable) {
            return null;
        }
    }
}
