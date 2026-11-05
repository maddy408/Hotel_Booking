<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class PaymentRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function record(int $hotelId, ?int $reservationId, ?int $stayId, string $type, float $amount, string $method, ?int $receivedBy, ?string $note = null): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO payments (hotel_id, reservation_id, stay_id, type, amount, method, received_by, note)
             VALUES (:hotel_id, :reservation_id, :stay_id, :type, :amount, :method, :received_by, :note)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId, 'reservation_id' => $reservationId, 'stay_id' => $stayId,
            'type' => $type, 'amount' => $amount, 'method' => $method, 'received_by' => $receivedBy, 'note' => $note,
        ]);
        return (int) $this->db->lastInsertId();
    }

    /** @return array<int,array<string,mixed>> */
    public function forStay(int $stayId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM payments WHERE stay_id = :stay_id ORDER BY id');
        $stmt->execute(['stay_id' => $stayId]);
        return $stmt->fetchAll();
    }

    /** @return array<int,array<string,mixed>> */
    public function forReservation(int $reservationId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM payments WHERE reservation_id = :reservation_id ORDER BY id');
        $stmt->execute(['reservation_id' => $reservationId]);
        return $stmt->fetchAll();
    }

    /** Net amount already settled toward a stay, counting its originating reservation's payments too. */
    public function netSettledForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                FROM payments WHERE stay_id = :stay_id";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                    FROM payments WHERE stay_id = :stay_id OR reservation_id = :reservation_id";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }
}
