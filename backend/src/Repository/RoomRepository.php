<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class RoomRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /** @return array<int,array<string,mixed>> */
    public function allForHotel(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT r.id, r.room_no, r.floor, r.housekeeping_status, r.note,
                    rt.id AS room_type_id, rt.code AS type_code, rt.name AS type_name, rt.rate AS type_rate, rt.max_persons
             FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
             WHERE r.hotel_id = :hotel_id
             ORDER BY r.floor, r.room_no'
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetchAll();
    }

    public function findByRoomNo(int $hotelId, int $roomNo): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT r.*, rt.code AS type_code, rt.name AS type_name, rt.rate AS type_rate, rt.max_persons
             FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
             WHERE r.hotel_id = :hotel_id AND r.room_no = :room_no'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'room_no' => $roomNo]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** Locks the room row for the duration of the caller's transaction (prevents concurrent double-booking). */
    public function lockById(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM rooms WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT r.*, rt.code AS type_code, rt.name AS type_name, rt.rate AS type_rate, rt.max_persons
             FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function roomNoExists(int $hotelId, int $roomNo): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM rooms WHERE hotel_id = :hotel_id AND room_no = :room_no');
        $stmt->execute(['hotel_id' => $hotelId, 'room_no' => $roomNo]);
        return $stmt->fetch() !== false;
    }

    /** One row per room currently occupied (status='in_house'), keyed by room_id. */
    public function inHouseStaysByRoom(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            "SELECT s.room_id, s.id AS stay_id, s.check_in_date, s.checkout_planned, s.guest_id, g.name AS guest_name
             FROM stays s JOIN guests g ON g.id = s.guest_id
             WHERE s.hotel_id = :hotel_id AND s.status = 'in_house'"
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        $byRoom = [];
        foreach ($stmt->fetchAll() as $row) {
            $byRoom[(int) $row['room_id']] = $row;
        }
        return $byRoom;
    }

    /** All pending reservations, ordered by check_in_date, grouped by room_id. */
    public function pendingReservationsByRoom(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            "SELECT b.room_id, b.id, b.booking_code, b.check_in_date, b.check_out_date, b.guest_id, g.name AS guest_name
             FROM reservations b JOIN guests g ON g.id = b.guest_id
             WHERE b.hotel_id = :hotel_id AND b.status = 'pending'
             ORDER BY b.check_in_date"
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        $byRoom = [];
        foreach ($stmt->fetchAll() as $row) {
            $byRoom[(int) $row['room_id']][] = $row;
        }
        return $byRoom;
    }

    public function liveReferenceCount(int $roomId): int
    {
        $stmt = $this->db->prepare(
            "SELECT
                (SELECT COUNT(*) FROM stays WHERE room_id = :id1 AND status = 'in_house')
              + (SELECT COUNT(*) FROM reservations WHERE room_id = :id2 AND status = 'pending')"
        );
        $stmt->execute(['id1' => $roomId, 'id2' => $roomId]);
        return (int) $stmt->fetchColumn();
    }

    public function insert(int $hotelId, int $roomNo, int $floor, int $roomTypeId): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO rooms (hotel_id, room_no, floor, room_type_id) VALUES (:hotel_id, :room_no, :floor, :room_type_id)'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'room_no' => $roomNo, 'floor' => $floor, 'room_type_id' => $roomTypeId]);
        return (int) $this->db->lastInsertId();
    }

    public function updateType(int $roomId, int $roomTypeId): void
    {
        $this->db->prepare('UPDATE rooms SET room_type_id = :type WHERE id = :id')
            ->execute(['type' => $roomTypeId, 'id' => $roomId]);
    }

    public function updateHousekeeping(int $roomId, string $status, ?string $note): void
    {
        $this->db->prepare('UPDATE rooms SET housekeeping_status = :status, note = :note WHERE id = :id')
            ->execute(['status' => $status, 'note' => $note, 'id' => $roomId]);
    }

    public function delete(int $roomId): void
    {
        $this->db->prepare('DELETE FROM rooms WHERE id = :id')->execute(['id' => $roomId]);
    }
}
