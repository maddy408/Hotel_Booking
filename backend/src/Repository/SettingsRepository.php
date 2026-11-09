<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class SettingsRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function find(int $hotelId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM settings WHERE hotel_id = :hotel_id');
        $stmt->execute(['hotel_id' => $hotelId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function update(int $hotelId, array $fields): void
    {
        $columns = [
            'gst_slab1_max_rate', 'gst_slab1_gst_rate', 'gst_slab2_max_rate', 'gst_slab2_gst_rate',
            'gst_slab3_gst_rate', 'tax_extras', 'checkout_hour', 'currency',
            'financial_year_start_month', 'invoice_prefix', 'booking_prefix',
            'whatsapp_checkout_template', 'whatsapp_checkin_template', 'whatsapp_checkin_enabled', 'timezone',
            'cancellation_deadline_hours', 'cancellation_free_allowed', 'cancellation_fee_type', 'cancellation_fee_value',
            'cancellation_late_fee_type', 'cancellation_late_fee_value',
            'early_checkout_refund_unused_nights', 'early_checkout_fee_type', 'early_checkout_fee_value',
        ];
        $set = [];
        $params = ['hotel_id' => $hotelId];
        foreach ($columns as $column) {
            if (array_key_exists($column, $fields)) {
                $set[] = "{$column} = :{$column}";
                $params[$column] = $fields[$column];
            }
        }
        if ($set === []) {
            return;
        }
        $this->db->prepare('UPDATE settings SET ' . implode(', ', $set) . ' WHERE hotel_id = :hotel_id')->execute($params);
    }
}
