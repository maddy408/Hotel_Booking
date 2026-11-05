<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class StayRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM stays WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function lockForUpdate(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM stays WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findInHouseByRoom(int $roomId): ?array
    {
        $stmt = $this->db->prepare("SELECT * FROM stays WHERE room_id = :room_id AND status = 'in_house' LIMIT 1");
        $stmt->execute(['room_id' => $roomId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findInHouseByGuest(int $guestId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT s.*, r.room_no FROM stays s JOIN rooms r ON r.id = s.room_id
             WHERE s.guest_id = :guest_id AND s.status = 'in_house' LIMIT 1"
        );
        $stmt->execute(['guest_id' => $guestId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Overlapping in-house/checked-out-in-the-future stays for a room within [checkIn, checkOut).
     * An in-house stay whose planned checkout has already slipped into the past (overstay)
     * is treated as blocking through "today + 1" — matching the prototype's roomFree() rule.
     * @return array<int,array<string,mixed>>
     */
    public function overlapping(int $roomId, string $checkIn, string $checkOut, string $today, ?int $excludeId = null): array
    {
        $sql = "SELECT *,
                    CASE WHEN checkout_planned > :today1 THEN checkout_planned ELSE DATE_ADD(:today2, INTERVAL 1 DAY) END AS effective_out
                FROM stays
                WHERE room_id = :room_id AND status = 'in_house'
                  AND check_in_date < :check_out
                  AND :check_in < (CASE WHEN checkout_planned > :today3 THEN checkout_planned ELSE DATE_ADD(:today4, INTERVAL 1 DAY) END)";
        $params = [
            'room_id' => $roomId, 'check_in' => $checkIn, 'check_out' => $checkOut,
            'today1' => $today, 'today2' => $today, 'today3' => $today, 'today4' => $today,
        ];
        if ($excludeId !== null) {
            $sql .= ' AND id != :exclude_id';
            $params['exclude_id'] = $excludeId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(int $hotelId, ?int $reservationId, int $roomId, int $guestId, int $persons, float $rate, string $checkIn, string $checkoutPlanned, ?int $createdBy): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO stays (hotel_id, reservation_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status, created_by)
             VALUES (:hotel_id, :reservation_id, :room_id, :guest_id, :persons, :rate, :check_in, :checkout_planned, \'in_house\', :created_by)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId, 'reservation_id' => $reservationId, 'room_id' => $roomId, 'guest_id' => $guestId,
            'persons' => $persons, 'rate' => $rate, 'check_in' => $checkIn, 'checkout_planned' => $checkoutPlanned, 'created_by' => $createdBy,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function extend(int $id, string $newCheckoutPlanned): void
    {
        $this->db->prepare('UPDATE stays SET checkout_planned = :out WHERE id = :id')
            ->execute(['out' => $newCheckoutPlanned, 'id' => $id]);
    }

    public function checkout(int $id, string $checkoutActual, string $paymentMethod): void
    {
        $this->db->prepare(
            "UPDATE stays SET status = 'checked_out', checkout_actual = :out, payment_method = :method WHERE id = :id"
        )->execute(['out' => $checkoutActual, 'method' => $paymentMethod, 'id' => $id]);
    }

    /** @return array<int,array<string,mixed>> */
    public function listDoneForHotel(int $hotelId, ?string $from = null, ?string $to = null): array
    {
        $sql = "SELECT s.*, g.name AS guest_name, g.phone AS guest_phone, r.room_no,
                       i.invoice_number, i.total_amount AS invoice_total
                FROM stays s JOIN guests g ON g.id = s.guest_id JOIN rooms r ON r.id = s.room_id
                LEFT JOIN invoices i ON i.stay_id = s.id
                WHERE s.hotel_id = :hotel_id AND s.status = 'checked_out'";
        $params = ['hotel_id' => $hotelId];
        if ($from !== null) {
            $sql .= ' AND s.checkout_actual >= :from';
            $params['from'] = $from;
        }
        if ($to !== null) {
            $sql .= ' AND s.checkout_actual <= :to';
            $params['to'] = $to;
        }
        $sql .= ' ORDER BY s.checkout_actual DESC, s.id DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function findWithDetails(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT s.*, g.name AS guest_name, g.phone AS guest_phone, g.id_proof_type, g.id_proof_last4,
                    r.room_no, rt.name AS room_type_name
             FROM stays s
             JOIN guests g ON g.id = s.guest_id
             JOIN rooms r ON r.id = s.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             WHERE s.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}
