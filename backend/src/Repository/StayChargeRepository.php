<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class StayChargeRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function add(
        int $stayId,
        string $label,
        float $amount,
        bool $isTaxable,
        ?int $addedBy,
        ?string $category = null,
        ?string $sacCode = null,
        float $gstRate = 0.0,
        float $gstAmount = 0.0
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO stay_charges (stay_id, label, amount, is_taxable, added_by, tax_category, sac_code, gst_rate, gst_amount)
             VALUES (:stay_id, :label, :amount, :is_taxable, :added_by, :tax_category, :sac_code, :gst_rate, :gst_amount)'
        );
        $stmt->execute([
            'stay_id' => $stayId,
            'label' => $label,
            'amount' => $amount,
            'is_taxable' => $isTaxable ? 1 : 0,
            'added_by' => $addedBy,
            'tax_category' => $category,
            'sac_code' => $sacCode,
            'gst_rate' => $gstRate,
            'gst_amount' => $gstAmount,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM stay_charges WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function remove(int $id, int $stayId): bool
    {
        $stmt = $this->db->prepare('DELETE FROM stay_charges WHERE id = :id AND stay_id = :stay_id');
        $stmt->execute(['id' => $id, 'stay_id' => $stayId]);
        return $stmt->rowCount() > 0;
    }

    /** @return array<int,array<string,mixed>> */
    public function forStay(int $stayId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM stay_charges WHERE stay_id = :stay_id ORDER BY id');
        $stmt->execute(['stay_id' => $stayId]);
        return $stmt->fetchAll();
    }
}
