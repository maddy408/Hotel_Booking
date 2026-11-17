<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class OccupantDocumentRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function create(
        int $hotelId,
        ?int $occupantId,
        string $filePath,
        string $originalFilename,
        string $mimeType,
        int $fileSize,
        ?int $reservationId = null,
        ?int $stayId = null,
    ): int {
        if ($stayId === null && $occupantId !== null && $occupantId > 0) {
            $occStmt = $this->db->prepare('SELECT stay_id FROM occupants WHERE id = :id');
            $occStmt->execute(['id' => $occupantId]);
            $occVal = $occStmt->fetchColumn();
            $stayId = $occVal !== false ? (int) $occVal : null;
        }

        if ($stayId !== null && $reservationId === null) {
            $stayStmt = $this->db->prepare('SELECT reservation_id FROM stays WHERE id = :id');
            $stayStmt->execute(['id' => $stayId]);
            $resVal = $stayStmt->fetchColumn();
            $reservationId = $resVal !== false && $resVal !== null ? (int) $resVal : null;
        }

        $stmt = $this->db->prepare(
            'INSERT INTO occupant_documents (hotel_id, reservation_id, stay_id, occupant_id, file_path, original_filename, mime_type, file_size)
             VALUES (:hotel_id, :reservation_id, :stay_id, :occupant_id, :file_path, :original_filename, :mime_type, :file_size)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'reservation_id' => $reservationId,
            'stay_id' => $stayId,
            'occupant_id' => $occupantId,
            'file_path' => $filePath,
            'original_filename' => $originalFilename,
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function findById(int $id, int $hotelId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*, 
                    COALESCE(d.stay_id, o.stay_id) AS stay_id,
                    o.occupant_number, 
                    o.name AS occupant_name
             FROM occupant_documents d
             LEFT JOIN occupants o ON o.id = d.occupant_id
             WHERE d.id = :id AND d.hotel_id = :hotel_id'
        );
        $stmt->execute([
            'id' => $id,
            'hotel_id' => $hotelId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    /** @return array<int, array<string, mixed>> */
    public function findByStay(int $stayId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*, 
                    COALESCE(d.stay_id, o.stay_id) AS stay_id,
                    o.occupant_number, 
                    o.name AS occupant_name, 
                    o.is_primary
             FROM occupant_documents d
             LEFT JOIN occupants o ON o.id = d.occupant_id
             WHERE (d.stay_id = :stay_id OR o.stay_id = :stay_id2) AND d.hotel_id = :hotel_id
             ORDER BY d.id ASC'
        );
        $stmt->execute([
            'stay_id' => $stayId,
            'stay_id2' => $stayId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int, array<string, mixed>> */
    public function findByReservation(int $reservationId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*
             FROM occupant_documents d
             WHERE d.reservation_id = :reservation_id AND d.hotel_id = :hotel_id
             ORDER BY d.id ASC'
        );
        $stmt->execute([
            'reservation_id' => $reservationId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function attachReservationDocumentsToStay(int $reservationId, int $stayId, int $hotelId): int
    {
        $stmt = $this->db->prepare(
            'UPDATE occupant_documents
             SET stay_id = :stay_id
             WHERE reservation_id = :reservation_id AND hotel_id = :hotel_id AND stay_id IS NULL'
        );
        $stmt->execute([
            'stay_id' => $stayId,
            'reservation_id' => $reservationId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->rowCount();
    }

    public function assignDocumentToOccupant(int $docId, int $occupantId, int $hotelId, ?int $stayId = null): void
    {
        $sql = 'UPDATE occupant_documents SET occupant_id = :occupant_id';
        $params = ['id' => $docId, 'occupant_id' => $occupantId, 'hotel_id' => $hotelId];
        if ($stayId !== null) {
            $sql .= ', stay_id = :stay_id';
            $params['stay_id'] = $stayId;
        }
        $sql .= ' WHERE id = :id AND hotel_id = :hotel_id';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
    }

    /** @return array<int, array<string, mixed>> */
    public function findByGuest(int $guestId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT d.*,
                    COALESCE(b.booking_code, s_res.booking_code, occ_res.booking_code) AS booking_code,
                    COALESCE(s_room.room_no, b_room.room_no, occ_room.room_no) AS room_no,
                    COALESCE(s.id, occ_stay.id) AS linked_stay_id,
                    COALESCE(b.id, s.reservation_id, occ_stay.reservation_id) AS linked_reservation_id,
                    o.occupant_number,
                    COALESCE(o.name, CASE WHEN o.is_primary = 1 THEN g.name ELSE NULL END, g.name) AS occupant_name,
                    o.is_primary
             FROM occupant_documents d
             LEFT JOIN reservations b ON b.id = d.reservation_id
             LEFT JOIN stays s ON s.id = d.stay_id
             LEFT JOIN reservations s_res ON s_res.id = s.reservation_id
             LEFT JOIN occupants o ON o.id = d.occupant_id
             LEFT JOIN stays occ_stay ON occ_stay.id = o.stay_id
             LEFT JOIN reservations occ_res ON occ_res.id = occ_stay.reservation_id
             LEFT JOIN rooms s_room ON s_room.id = s.room_id
             LEFT JOIN rooms b_room ON b_room.id = b.room_id
             LEFT JOIN rooms occ_room ON occ_room.id = occ_stay.room_id
             JOIN guests g ON g.id = :guest_id
             WHERE d.hotel_id = :hotel_id
               AND (
                   (d.reservation_id IS NOT NULL AND b.guest_id = :guest_id1) 
                   OR (d.stay_id IS NOT NULL AND s.guest_id = :guest_id2)
                   OR (d.occupant_id IS NOT NULL AND (o.guest_id = :guest_id3 OR occ_stay.guest_id = :guest_id4))
               )
             ORDER BY d.uploaded_at DESC, d.id DESC'
        );
        $stmt->execute([
            'guest_id' => $guestId,
            'hotel_id' => $hotelId,
            'guest_id1' => $guestId,
            'guest_id2' => $guestId,
            'guest_id3' => $guestId,
            'guest_id4' => $guestId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int, array<string, mixed>> */
    public function findByOccupant(int $occupantId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM occupant_documents
             WHERE occupant_id = :occupant_id AND hotel_id = :hotel_id
             ORDER BY id ASC'
        );
        $stmt->execute([
            'occupant_id' => $occupantId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function delete(int $id, int $hotelId): bool
    {
        $stmt = $this->db->prepare(
            'DELETE FROM occupant_documents WHERE id = :id AND hotel_id = :hotel_id'
        );
        $stmt->execute([
            'id' => $id,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->rowCount() > 0;
    }
}
