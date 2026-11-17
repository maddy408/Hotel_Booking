<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class OccupantRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function create(
        int $hotelId,
        int $stayId,
        int $occupantNumber,
        ?string $name = null,
        bool $isPrimary = false,
        ?int $guestId = null,
        ?string $gender = null,
        ?string $phone = null,
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO occupants (hotel_id, stay_id, occupant_number, name, gender, phone, is_primary, guest_id)
             VALUES (:hotel_id, :stay_id, :occupant_number, :name, :gender, :phone, :is_primary, :guest_id)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'stay_id' => $stayId,
            'occupant_number' => $occupantNumber,
            'name' => $name !== null && trim($name) !== '' ? trim($name) : null,
            'gender' => $gender !== null && trim($gender) !== '' ? trim($gender) : null,
            'phone' => $phone !== null && trim($phone) !== '' ? trim($phone) : null,
            'is_primary' => $isPrimary ? 1 : 0,
            'guest_id' => $guestId,
        ]);
        return (int) $this->db->lastInsertId();
    }

    /** @return array<int, array<string, mixed>> */
    public function findByStay(int $stayId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT o.*, g.name AS primary_guest_name, g.phone AS primary_guest_phone
             FROM occupants o
             LEFT JOIN guests g ON g.id = o.guest_id
             WHERE o.stay_id = :stay_id AND o.hotel_id = :hotel_id
             ORDER BY o.occupant_number ASC'
        );
        $stmt->execute([
            'stay_id' => $stayId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findById(int $id, int $hotelId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM occupants WHERE id = :id AND hotel_id = :hotel_id'
        );
        $stmt->execute([
            'id' => $id,
            'hotel_id' => $hotelId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    public function deleteByStay(int $stayId): void
    {
        $stmt = $this->db->prepare('DELETE FROM occupants WHERE stay_id = :stay_id');
        $stmt->execute(['stay_id' => $stayId]);
    }
}
