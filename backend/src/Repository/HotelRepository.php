<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class HotelRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function find(int $hotelId): ?array
    {
        $stmt = $this->db->prepare('SELECT id, name, place, address, gstin, phone, email FROM hotels WHERE id = :id');
        $stmt->execute(['id' => $hotelId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function update(int $hotelId, string $name, ?string $place, ?string $address, ?string $gstin, ?string $phone, ?string $email): void
    {
        $stmt = $this->db->prepare(
            'UPDATE hotels SET name = :name, place = :place, address = :address, gstin = :gstin, phone = :phone, email = :email WHERE id = :id'
        );
        $stmt->execute([
            'name' => $name, 'place' => $place, 'address' => $address,
            'gstin' => $gstin, 'phone' => $phone, 'email' => $email, 'id' => $hotelId,
        ]);
    }
}
