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
            }

            $stayCols = self::getColumns($db, 'stays');
            if ($stayCols !== null) {
                if (!in_array('checkout_time', $stayCols, true)) {
                    $db->exec("ALTER TABLE stays ADD COLUMN checkout_time TIME NOT NULL DEFAULT '12:00:00' AFTER checkout_planned");
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
