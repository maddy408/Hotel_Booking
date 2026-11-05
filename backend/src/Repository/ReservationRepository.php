<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class ReservationRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM reservations WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function lockForUpdate(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM reservations WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Overlapping *pending* reservations for a room within [checkIn, checkOut).
     * @return array<int,array<string,mixed>>
     */
    public function overlapping(int $roomId, string $checkIn, string $checkOut, ?int $excludeId = null): array
    {
        $sql = "SELECT * FROM reservations
                WHERE room_id = :room_id AND status = 'pending'
                  AND check_in_date < :check_out AND :check_in < check_out_date";
        $params = ['room_id' => $roomId, 'check_in' => $checkIn, 'check_out' => $checkOut];
        if ($excludeId !== null) {
            $sql .= ' AND id != :exclude_id';
            $params['exclude_id'] = $excludeId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function create(int $hotelId, string $bookingCode, int $roomId, int $guestId, string $checkIn, string $checkOut, int $persons, float $rate, float $advanceAmount, string $advanceMethod, ?int $createdBy): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, advance_method, status, created_by)
             VALUES (:hotel_id, :booking_code, :room_id, :guest_id, :check_in, :check_out, :persons, :rate, :advance_amount, :advance_method, \'pending\', :created_by)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId, 'booking_code' => $bookingCode, 'room_id' => $roomId, 'guest_id' => $guestId,
            'check_in' => $checkIn, 'check_out' => $checkOut, 'persons' => $persons, 'rate' => $rate,
            'advance_amount' => $advanceAmount, 'advance_method' => $advanceMethod, 'created_by' => $createdBy,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function setBookingCode(int $id, string $bookingCode): void
    {
        $this->db->prepare('UPDATE reservations SET booking_code = :code WHERE id = :id')
            ->execute(['code' => $bookingCode, 'id' => $id]);
    }

    public function update(int $id, int $roomId, string $checkIn, string $checkOut, int $persons, float $rate, float $advanceAmount, string $advanceMethod): void
    {
        $stmt = $this->db->prepare(
            'UPDATE reservations SET room_id = :room_id, check_in_date = :check_in, check_out_date = :check_out,
                    persons = :persons, rate = :rate, advance_amount = :advance_amount, advance_method = :advance_method
             WHERE id = :id'
        );
        $stmt->execute([
            'room_id' => $roomId, 'check_in' => $checkIn, 'check_out' => $checkOut, 'persons' => $persons,
            'rate' => $rate, 'advance_amount' => $advanceAmount, 'advance_method' => $advanceMethod, 'id' => $id,
        ]);
    }

    public function markCheckedIn(int $id): void
    {
        $this->db->prepare("UPDATE reservations SET status = 'checked_in' WHERE id = :id")->execute(['id' => $id]);
    }

    public function cancel(int $id, string $reason): void
    {
        $this->db->prepare("UPDATE reservations SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = :reason WHERE id = :id")
            ->execute(['reason' => $reason, 'id' => $id]);
    }

    public function markNoShow(int $id): void
    {
        $this->db->prepare("UPDATE reservations SET status = 'no_show' WHERE id = :id")->execute(['id' => $id]);
    }

    /** @return array<int,array<string,mixed>> all live (pending) bookings for a hotel, with guest/room info */
    public function listPending(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            "SELECT b.*, g.name AS guest_name, g.phone AS guest_phone, r.room_no
             FROM reservations b
             JOIN guests g ON g.id = b.guest_id
             JOIN rooms r ON r.id = b.room_id
             WHERE b.hotel_id = :hotel_id AND b.status = 'pending'
             ORDER BY b.check_in_date, r.room_no"
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetchAll();
    }

    public function findPendingByGuest(int $guestId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT b.*, r.room_no FROM reservations b JOIN rooms r ON r.id = b.room_id
             WHERE b.guest_id = :guest_id AND b.status = 'pending' ORDER BY b.check_in_date LIMIT 1"
        );
        $stmt->execute(['guest_id' => $guestId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findWithDetails(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT b.*, g.name AS guest_name, g.phone AS guest_phone, r.room_no
             FROM reservations b JOIN guests g ON g.id = b.guest_id JOIN rooms r ON r.id = b.room_id
             WHERE b.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}
