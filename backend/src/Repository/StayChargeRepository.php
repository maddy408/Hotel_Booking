<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class StayChargeRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function add(int $stayId, string $label, float $amount, bool $isTaxable, ?int $addedBy): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO stay_charges (stay_id, label, amount, is_taxable, added_by) VALUES (:stay_id, :label, :amount, :is_taxable, :added_by)'
        );
        $stmt->execute(['stay_id' => $stayId, 'label' => $label, 'amount' => $amount, 'is_taxable' => $isTaxable ? 1 : 0, 'added_by' => $addedBy]);
        return (int) $this->db->lastInsertId();
    }

    public function remove(int $id, int $stayId): void
    {
        $this->db->prepare('DELETE FROM stay_charges WHERE id = :id AND stay_id = :stay_id')
            ->execute(['id' => $id, 'stay_id' => $stayId]);
    }

    /** @return array<int,array<string,mixed>> */
    public function forStay(int $stayId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM stay_charges WHERE stay_id = :stay_id ORDER BY id');
        $stmt->execute(['stay_id' => $stayId]);
        return $stmt->fetchAll();
    }
}
