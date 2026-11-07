<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class ReservationRepository
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
     * Overlapping active (pending or checked_in with active stay) reservations for a room within [checkIn, checkOut).
     * @return array<int,array<string,mixed>>
     */
    public function overlapping(int $roomId, string $checkIn, string $checkOut, ?int $excludeId = null): array
    {
        $sql = "SELECT * FROM reservations
                WHERE room_id = :room_id
                  AND (
                    status = 'pending'
                    OR (status = 'checked_in' AND EXISTS (
                      SELECT 1 FROM stays s
                      WHERE s.reservation_id = reservations.id AND s.status = 'in_house'
                    ))
                  )
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

    public function create(
        int $hotelId,
        string $bookingCode,
        int $roomId,
        int $guestId,
        string $checkIn,
        string $checkOut,
        int $persons,
        float $rate,
        float $advanceAmount,
        string $advanceMethod,
        ?int $createdBy,
        string $checkOutTime = '12:00:00'
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, check_out_time, persons, rate, advance_amount, advance_method, status, created_by)
             VALUES (:hotel_id, :booking_code, :room_id, :guest_id, :check_in, :check_out, :check_out_time, :persons, :rate, :advance_amount, :advance_method, \'pending\', :created_by)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'booking_code' => $bookingCode,
            'room_id' => $roomId,
            'guest_id' => $guestId,
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'check_out_time' => $checkOutTime,
            'persons' => $persons,
            'rate' => $rate,
            'advance_amount' => $advanceAmount,
            'advance_method' => $advanceMethod,
            'created_by' => $createdBy,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function setBookingCode(int $id, string $bookingCode): void
    {
        $this->db->prepare('UPDATE reservations SET booking_code = :code WHERE id = :id')
            ->execute(['code' => $bookingCode, 'id' => $id]);
    }

    public function update(
        int $id,
        int $roomId,
        string $checkIn,
        string $checkOut,
        int $persons,
        float $rate,
        float $advanceAmount,
        string $advanceMethod,
        string $checkOutTime = '12:00:00'
    ): void {
        $stmt = $this->db->prepare(
            'UPDATE reservations SET room_id = :room_id, check_in_date = :check_in, check_out_date = :check_out,
                    check_out_time = :check_out_time, persons = :persons, rate = :rate,
                    advance_amount = :advance_amount, advance_method = :advance_method
             WHERE id = :id'
        );
        $stmt->execute([
            'room_id' => $roomId,
            'check_in' => $checkIn,
            'check_out' => $checkOut,
            'check_out_time' => $checkOutTime,
            'persons' => $persons,
            'rate' => $rate,
            'advance_amount' => $advanceAmount,
            'advance_method' => $advanceMethod,
            'id' => $id,
        ]);
    }

    public function markCheckedIn(int $id): void
    {
        $this->db->prepare("UPDATE reservations SET status = 'checked_in' WHERE id = :id")->execute(['id' => $id]);
    }

    public function cancel(int $id, string $reason, float $cancellationFee = 0.0, float $refundableAmount = 0.0, ?int $cancelledBy = null): void
    {
        $this->db->prepare(
            "UPDATE reservations
             SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = :reason,
                 cancellation_fee = :fee, refundable_amount = :refund, cancelled_by = :user
             WHERE id = :id"
        )->execute([
            'reason' => $reason,
            'fee' => $cancellationFee,
            'refund' => $refundableAmount,
            'user' => $cancelledBy,
            'id' => $id,
        ]);
    }

    public function markNoShow(int $id): void
    {
        $this->db->prepare("UPDATE reservations SET status = 'no_show' WHERE id = :id")->execute(['id' => $id]);
    }

    /** @return array<int,array<string,mixed>> all live (pending) bookings for a hotel, with guest/room info and actual successful advance paid */
    public function listPending(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            "SELECT b.*, g.name AS guest_name, g.phone AS guest_phone, r.room_no, r.housekeeping_status,
                    rt.max_persons, rt.name AS room_type_name,
                    COALESCE((
                        SELECT SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END)
                        FROM payments p
                        WHERE p.reservation_id = b.id AND p.type IN ('advance', 'refund') AND p.status = 'successful'
                    ), 0) AS advance_paid
             FROM reservations b
             JOIN guests g ON g.id = b.guest_id
             JOIN rooms r ON r.id = b.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             WHERE b.hotel_id = :hotel_id AND b.status = 'pending'
             ORDER BY b.check_in_date, r.room_no"
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetchAll();
    }

    public function findPendingByGuest(int $guestId): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT b.*, r.room_no, r.housekeeping_status, rt.max_persons, rt.name AS room_type_name,
                    COALESCE((
                        SELECT SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END)
                        FROM payments p
                        WHERE p.reservation_id = b.id AND p.type IN ('advance', 'refund') AND p.status = 'successful'
                    ), 0) AS advance_paid
             FROM reservations b
             JOIN rooms r ON r.id = b.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             WHERE b.guest_id = :guest_id AND b.status = 'pending' ORDER BY b.check_in_date LIMIT 1"
        );
        $stmt->execute(['guest_id' => $guestId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findWithDetails(int $id): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT b.*, g.name AS guest_name, g.phone AS guest_phone, r.room_no, r.housekeeping_status,
                    rt.max_persons, rt.name AS room_type_name, u_cb.name AS cancelled_by_name,
                    COALESCE((
                        SELECT SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END)
                        FROM payments p
                        WHERE p.reservation_id = b.id AND p.type IN ('advance', 'refund') AND p.status = 'successful'
                    ), 0) AS advance_paid
             FROM reservations b
             JOIN guests g ON g.id = b.guest_id
             JOIN rooms r ON r.id = b.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             LEFT JOIN users u_cb ON u_cb.id = b.cancelled_by
             WHERE b.id = :id"
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }
}
