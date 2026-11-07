<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class GuestRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function findByPhone(int $hotelId, string $phone): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM guests WHERE hotel_id = :hotel_id AND phone = :phone LIMIT 1');
        $stmt->execute(['hotel_id' => $hotelId, 'phone' => $phone]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM guests WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function create(int $hotelId, string $name, string $phone, string $idProofType, ?string $idProofNumberEnc, ?string $idProofLast4, ?string $city): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO guests (hotel_id, name, phone, id_proof_type, id_proof_number_enc, id_proof_last4, city)
             VALUES (:hotel_id, :name, :phone, :id_proof_type, :id_proof_number_enc, :id_proof_last4, :city)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId, 'name' => $name, 'phone' => $phone, 'id_proof_type' => $idProofType,
            'id_proof_number_enc' => $idProofNumberEnc, 'id_proof_last4' => $idProofLast4, 'city' => $city,
        ]);
        return (int) $this->db->lastInsertId();
    }

    /** @param array<string,mixed> $fields */
    public function update(int $id, array $fields): void
    {
        $columns = ['name', 'phone', 'id_proof_type', 'id_proof_number_enc', 'id_proof_last4', 'city', 'is_foreign', 'nationality', 'passport_number_enc', 'visa_number_enc', 'visa_expiry', 'id_image_path'];
        $set = [];
        $params = ['id' => $id];
        foreach ($columns as $column) {
            if (array_key_exists($column, $fields)) {
                $set[] = "{$column} = :{$column}";
                $params[$column] = $fields[$column];
            }
        }
        if ($set === []) {
            return;
        }
        $this->db->prepare('UPDATE guests SET ' . implode(', ', $set) . ' WHERE id = :id')->execute($params);
    }

    /** @return array<int,array<string,mixed>> */
    public function search(int $hotelId, string $query): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM guests WHERE hotel_id = :hotel_id
             AND (:q = '' OR name LIKE :like1 OR phone LIKE :like2 OR city LIKE :like3)
             ORDER BY name"
        );
        $like = '%' . $query . '%';
        $stmt->execute(['hotel_id' => $hotelId, 'q' => $query, 'like1' => $like, 'like2' => $like, 'like3' => $like]);
        return $stmt->fetchAll();
    }

    public function visitCount(int $guestId): int
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) FROM stays WHERE guest_id = :id AND status != 'cancelled'"
        );
        $stmt->execute(['id' => $guestId]);
        return (int) $stmt->fetchColumn();
    }

    /** @return array<int,array<string,mixed>> newest-first stay + booking history for a guest */
    public function history(int $guestId): array
    {
        $stmt = $this->db->prepare(
            "SELECT 'stay' AS kind, s.id, r.room_no, s.check_in_date AS check_in, s.checkout_planned AS check_out, s.status, s.checkout_actual, NULL AS booking_code
             FROM stays s JOIN rooms r ON r.id = s.room_id WHERE s.guest_id = :id1
             UNION ALL
             SELECT 'reservation' AS kind, b.id, r.room_no, b.check_in_date AS check_in, b.check_out_date AS check_out, b.status, NULL AS checkout_actual, b.booking_code
             FROM reservations b JOIN rooms r ON r.id = b.room_id WHERE b.guest_id = :id2
             ORDER BY check_in DESC"
        );
        $stmt->execute(['id1' => $guestId, 'id2' => $guestId]);
        return $stmt->fetchAll();
    }
}
