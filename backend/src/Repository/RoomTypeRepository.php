<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class RoomTypeRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function allForHotel(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT rt.*, (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id) AS room_count
             FROM room_types rt WHERE rt.hotel_id = :hotel_id ORDER BY rt.rate'
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM room_types WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findByCode(int $hotelId, string $code): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM room_types WHERE hotel_id = :hotel_id AND code = :code');
        $stmt->execute(['hotel_id' => $hotelId, 'code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(int $hotelId, string $code, string $name, float $rate, int $maxPersons): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO room_types (hotel_id, code, name, rate, max_persons) VALUES (:hotel_id, :code, :name, :rate, :max_persons)'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'code' => $code, 'name' => $name, 'rate' => $rate, 'max_persons' => $maxPersons]);
        return (int) $this->db->lastInsertId();
    }

    public function update(int $id, string $name, float $rate, int $maxPersons): void
    {
        $this->db->prepare('UPDATE room_types SET name = :name, rate = :rate, max_persons = :max_persons WHERE id = :id')
            ->execute(['name' => $name, 'rate' => $rate, 'max_persons' => $maxPersons, 'id' => $id]);
    }

    public function roomCount(int $id): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM rooms WHERE room_type_id = :id');
        $stmt->execute(['id' => $id]);
        return (int) $stmt->fetchColumn();
    }

    public function delete(int $id): void
    {
        $this->db->prepare('DELETE FROM room_types WHERE id = :id')->execute(['id' => $id]);
    }
}
