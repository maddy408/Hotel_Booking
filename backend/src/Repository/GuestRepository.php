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

    public function create(int $hotelId, string $name, string $phone, string $idProofType, ?string $idProofNumberEnc, ?string $idProofLast4, ?string $city, ?string $email = null, ?string $address = null): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO guests (hotel_id, name, phone, email, id_proof_type, id_proof_number_enc, id_proof_last4, city, address)
             VALUES (:hotel_id, :name, :phone, :email, :id_proof_type, :id_proof_number_enc, :id_proof_last4, :city, :address)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId, 'name' => $name, 'phone' => $phone, 'email' => $email, 'id_proof_type' => $idProofType,
            'id_proof_number_enc' => $idProofNumberEnc, 'id_proof_last4' => $idProofLast4, 'city' => $city, 'address' => $address,
        ]);
        return (int) $this->db->lastInsertId();
    }

    /** @param array<string,mixed> $fields */
    public function update(int $id, array $fields): void
    {
        $columns = ['name', 'phone', 'email', 'id_proof_type', 'id_proof_number_enc', 'id_proof_last4', 'city', 'address', 'is_foreign', 'nationality', 'passport_number_enc', 'visa_number_enc', 'visa_expiry', 'id_image_path'];
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
             AND (:q = '' OR name LIKE :like1 OR phone LIKE :like2 OR city LIKE :like3 OR (email IS NOT NULL AND email LIKE :like4) OR (address IS NOT NULL AND address LIKE :like5))
             ORDER BY name"
        );
        $like = '%' . $query . '%';
        $stmt->execute(['hotel_id' => $hotelId, 'q' => $query, 'like1' => $like, 'like2' => $like, 'like3' => $like, 'like4' => $like, 'like5' => $like]);
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

    /**
     * Resolves Guest & Occupancy Register entries for a list of guests.
     * Follows priority:
     * 1. Active in-house stay
     * 2. Upcoming booking
     * 3. Latest completed stay
     * 4. Empty values
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    public function getRegisterEntries(int $hotelId, array $rows, ?\App\Service\GuestService $guestService = null): array
    {
        if (empty($rows)) {
            return [];
        }

        $inHouseStmt = $this->db->prepare(
            "SELECT s.id, s.room_id, r.room_no, s.persons, s.check_in_date, s.checkout_planned, s.status,
                    s.referred_by_guest_id, s.reservation_id,
                    res.referred_by_guest_id AS res_ref_id
             FROM stays s
             JOIN rooms r ON r.id = s.room_id
             LEFT JOIN reservations res ON res.id = s.reservation_id
             WHERE s.hotel_id = :hotel_id AND s.guest_id = :guest_id AND s.status = 'in_house'
             ORDER BY s.check_in_date ASC, s.id ASC"
        );

        $pendingStmt = $this->db->prepare(
            "SELECT b.id, b.room_id, r.room_no, b.persons, b.check_in_date, b.check_out_date, b.status,
                    b.referred_by_guest_id
             FROM reservations b
             JOIN rooms r ON r.id = b.room_id
             WHERE b.hotel_id = :hotel_id AND b.guest_id = :guest_id AND b.status = 'pending'
             ORDER BY b.check_in_date ASC, b.id ASC"
        );

        $completedStmt = $this->db->prepare(
            "SELECT s.id, s.room_id, r.room_no, s.persons, s.check_in_date, s.checkout_actual, s.checkout_planned, s.status,
                    s.referred_by_guest_id, s.reservation_id,
                    res.referred_by_guest_id AS res_ref_id
             FROM stays s
             JOIN rooms r ON r.id = s.room_id
             LEFT JOIN reservations res ON res.id = s.reservation_id
             WHERE s.hotel_id = :hotel_id AND s.guest_id = :guest_id AND s.status = 'checked_out'
             ORDER BY COALESCE(s.checkout_actual, s.checkout_planned, s.check_in_date) DESC, s.id DESC
             LIMIT 1"
        );

        $otherResStmt = $this->db->prepare(
            "SELECT b.id, b.room_id, r.room_no, b.persons, b.check_in_date, b.status, b.referred_by_guest_id
             FROM reservations b
             JOIN rooms r ON r.id = b.room_id
             WHERE b.hotel_id = :hotel_id AND b.guest_id = :guest_id AND b.status IN ('cancelled', 'no_show')
             ORDER BY b.check_in_date DESC, b.id DESC
             LIMIT 1"
        );

        $occStmt = $this->db->prepare(
            "SELECT id, occupant_number, name, gender, phone, is_primary
             FROM occupants
             WHERE stay_id = :stay_id AND hotel_id = :hotel_id
             ORDER BY occupant_number ASC, id ASC"
        );

        $refStmt = $this->db->prepare("SELECT id, name FROM guests WHERE id = :id LIMIT 1");

        $fallbackRefStmt = $this->db->prepare(
            "SELECT referred_by_guest_id FROM reservations 
             WHERE guest_id = :guest_id AND referred_by_guest_id IS NOT NULL 
             ORDER BY id DESC LIMIT 1"
        );

        $visitStmt = $this->db->prepare(
            "SELECT COUNT(*) FROM stays WHERE guest_id = :id AND status != 'cancelled'"
        );

        $results = [];

        foreach ($rows as $g) {
            $guestId = (int) $g['id'];
            $public = $guestService !== null ? $guestService->toPublic($g) : $g;

            $visitStmt->execute(['id' => $guestId]);
            $visits = (int) $visitStmt->fetchColumn();

            $inHouseStmt->execute(['hotel_id' => $hotelId, 'guest_id' => $guestId]);
            $inHouseStays = $inHouseStmt->fetchAll(\PDO::FETCH_ASSOC);

            $pendingStmt->execute(['hotel_id' => $hotelId, 'guest_id' => $guestId]);
            $pendingBookings = $pendingStmt->fetchAll(\PDO::FETCH_ASSOC);

            // Rule 1: Active in-house stay
            if (!empty($inHouseStays)) {
                $primary = $inHouseStays[0];
                $stayId = (int) $primary['id'];

                $occStmt->execute(['stay_id' => $stayId, 'hotel_id' => $hotelId]);
                $occRows = $occStmt->fetchAll(\PDO::FETCH_ASSOC);

                if (empty($occRows)) {
                    $occupants = [
                        [
                            'name' => $g['name'],
                            'is_primary' => true,
                            'isPrimary' => true,
                            'role' => 'Primary Guest',
                        ],
                    ];
                } else {
                    $occupants = array_map(function ($o) use ($g) {
                        $name = !empty(trim($o['name'] ?? ''))
                            ? trim($o['name'])
                            : ($o['is_primary'] ? $g['name'] : 'Occupant ' . $o['occupant_number']);
                        $isPrimary = (bool) $o['is_primary'];
                        return [
                            'name' => $name,
                            'is_primary' => $isPrimary,
                            'isPrimary' => $isPrimary,
                            'role' => $isPrimary ? 'Primary Guest' : 'Additional Occupant',
                        ];
                    }, $occRows);
                }

                $refId = $primary['referred_by_guest_id'] ?? $primary['res_ref_id'] ?? null;
                if (!$refId) {
                    $fallbackRefStmt->execute(['guest_id' => $guestId]);
                    $refId = $fallbackRefStmt->fetchColumn() ?: null;
                }
                $referrer = null;
                if ($refId) {
                    $refStmt->execute(['id' => (int) $refId]);
                    $refRow = $refStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($refRow) {
                        $referrer = ['id' => (int) $refRow['id'], 'name' => $refRow['name']];
                    }
                }

                $otherRooms = [];
                for ($i = 1; $i < count($inHouseStays); $i++) {
                    $otherRooms[] = (int) $inHouseStays[$i]['room_no'];
                }

                $public['room'] = (int) $primary['room_no'];
                $public['additionalRooms'] = $otherRooms;
                $public['additional_rooms'] = $otherRooms;
                $public['persons'] = (int) $primary['persons'];
                $public['occupants'] = $occupants;
                $public['occupantsStatus'] = 'ok';
                $public['occupants_status'] = 'ok';
                $public['referredBy'] = $referrer;
                $public['referred_by'] = $referrer;
                $public['visits'] = $visits;
                $public['status'] = 'In-House';
                $public['statusKey'] = 'in_house';
                $public['status_key'] = 'in_house';
                $public['stayId'] = $stayId;
                $public['bookingId'] = $primary['reservation_id'] ? (int) $primary['reservation_id'] : null;
                $public['conflictingUpcoming'] = count($pendingBookings);
                $public['now'] = [
                    'type' => 'in_house',
                    'roomNo' => (int) $primary['room_no'],
                    'stayId' => $stayId,
                    'bookingId' => null,
                    'bookingDate' => null,
                ];

                $results[] = $public;
                continue;
            }

            // Rule 2: Upcoming booking
            if (!empty($pendingBookings)) {
                $primary = $pendingBookings[0];
                $bookingId = (int) $primary['id'];

                $refId = $primary['referred_by_guest_id'] ?? null;
                if (!$refId) {
                    $fallbackRefStmt->execute(['guest_id' => $guestId]);
                    $refId = $fallbackRefStmt->fetchColumn() ?: null;
                }
                $referrer = null;
                if ($refId) {
                    $refStmt->execute(['id' => (int) $refId]);
                    $refRow = $refStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($refRow) {
                        $referrer = ['id' => (int) $refRow['id'], 'name' => $refRow['name']];
                    }
                }

                $otherPending = [];
                for ($i = 1; $i < count($pendingBookings); $i++) {
                    $otherPending[] = [
                        'id' => (int) $pendingBookings[$i]['id'],
                        'room_no' => (int) $pendingBookings[$i]['room_no'],
                        'check_in_date' => $pendingBookings[$i]['check_in_date'],
                    ];
                }

                $public['room'] = (int) $primary['room_no'];
                $public['additionalRooms'] = [];
                $public['additional_rooms'] = [];
                $public['additionalPending'] = $otherPending;
                $public['persons'] = (int) $primary['persons'];
                $public['occupants'] = [];
                $public['occupantsStatus'] = 'not_added_yet';
                $public['occupants_status'] = 'not_added_yet';
                $public['referredBy'] = $referrer;
                $public['referred_by'] = $referrer;
                $public['visits'] = $visits;
                $public['status'] = 'Booked';
                $public['statusKey'] = 'booked';
                $public['status_key'] = 'booked';
                $public['stayId'] = null;
                $public['bookingId'] = $bookingId;
                $public['conflictingUpcoming'] = 0;
                $public['now'] = [
                    'type' => 'booked',
                    'roomNo' => (int) $primary['room_no'],
                    'stayId' => null,
                    'bookingId' => $bookingId,
                    'bookingDate' => $primary['check_in_date'],
                ];

                $results[] = $public;
                continue;
            }

            // Rule 3: Latest completed stay
            $completedStmt->execute(['hotel_id' => $hotelId, 'guest_id' => $guestId]);
            $latestCompleted = $completedStmt->fetch(\PDO::FETCH_ASSOC);

            $otherResStmt->execute(['hotel_id' => $hotelId, 'guest_id' => $guestId]);
            $latestOtherRes = $otherResStmt->fetch(\PDO::FETCH_ASSOC);

            if ($latestCompleted) {
                $stayId = (int) $latestCompleted['id'];
                $occStmt->execute(['stay_id' => $stayId, 'hotel_id' => $hotelId]);
                $occRows = $occStmt->fetchAll(\PDO::FETCH_ASSOC);

                if (empty($occRows)) {
                    $occupants = [
                        [
                            'name' => $g['name'],
                            'is_primary' => true,
                            'isPrimary' => true,
                            'role' => 'Primary Guest',
                        ],
                    ];
                } else {
                    $occupants = array_map(function ($o) use ($g) {
                        $name = !empty(trim($o['name'] ?? ''))
                            ? trim($o['name'])
                            : ($o['is_primary'] ? $g['name'] : 'Occupant ' . $o['occupant_number']);
                        $isPrimary = (bool) $o['is_primary'];
                        return [
                            'name' => $name,
                            'is_primary' => $isPrimary,
                            'isPrimary' => $isPrimary,
                            'role' => $isPrimary ? 'Primary Guest' : 'Additional Occupant',
                        ];
                    }, $occRows);
                }

                $refId = $latestCompleted['referred_by_guest_id'] ?? $latestCompleted['res_ref_id'] ?? null;
                if (!$refId) {
                    $fallbackRefStmt->execute(['guest_id' => $guestId]);
                    $refId = $fallbackRefStmt->fetchColumn() ?: null;
                }
                $referrer = null;
                if ($refId) {
                    $refStmt->execute(['id' => (int) $refId]);
                    $refRow = $refStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($refRow) {
                        $referrer = ['id' => (int) $refRow['id'], 'name' => $refRow['name']];
                    }
                }

                $public['room'] = null;
                $public['additionalRooms'] = [];
                $public['additional_rooms'] = [];
                $public['persons'] = (int) $latestCompleted['persons'];
                $public['occupants'] = $occupants;
                $public['occupantsStatus'] = 'ok';
                $public['occupants_status'] = 'ok';
                $public['referredBy'] = $referrer;
                $public['referred_by'] = $referrer;
                $public['visits'] = $visits;
                $public['status'] = 'Checked Out';
                $public['statusKey'] = 'checked_out';
                $public['status_key'] = 'checked_out';
                $public['stayId'] = $stayId;
                $public['bookingId'] = $latestCompleted['reservation_id'] ? (int) $latestCompleted['reservation_id'] : null;
                $public['conflictingUpcoming'] = 0;
                $public['now'] = null;

                $results[] = $public;
                continue;
            }

            if ($latestOtherRes) {
                $refId = $latestOtherRes['referred_by_guest_id'] ?? null;
                if (!$refId) {
                    $fallbackRefStmt->execute(['guest_id' => $guestId]);
                    $refId = $fallbackRefStmt->fetchColumn() ?: null;
                }
                $referrer = null;
                if ($refId) {
                    $refStmt->execute(['id' => (int) $refId]);
                    $refRow = $refStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($refRow) {
                        $referrer = ['id' => (int) $refRow['id'], 'name' => $refRow['name']];
                    }
                }

                $statusLabel = $latestOtherRes['status'] === 'no_show' ? 'No-Show' : 'Cancelled';
                $public['room'] = null;
                $public['additionalRooms'] = [];
                $public['additional_rooms'] = [];
                $public['persons'] = (int) $latestOtherRes['persons'];
                $public['occupants'] = [];
                $public['occupantsStatus'] = 'none';
                $public['occupants_status'] = 'none';
                $public['referredBy'] = $referrer;
                $public['referred_by'] = $referrer;
                $public['visits'] = $visits;
                $public['status'] = $statusLabel;
                $public['statusKey'] = $latestOtherRes['status'];
                $public['status_key'] = $latestOtherRes['status'];
                $public['stayId'] = null;
                $public['bookingId'] = (int) $latestOtherRes['id'];
                $public['conflictingUpcoming'] = 0;
                $public['now'] = null;

                $results[] = $public;
                continue;
            }

            // Rule 4: No stay or booking
            $public['room'] = null;
            $public['additionalRooms'] = [];
            $public['additional_rooms'] = [];
            $public['persons'] = null;
            $public['occupants'] = [];
            $public['occupantsStatus'] = 'none';
            $public['occupants_status'] = 'none';
            $public['referredBy'] = null;
            $public['referred_by'] = null;
            $public['visits'] = $visits;
            $public['status'] = 'Not Staying';
            $public['statusKey'] = 'not_staying';
            $public['status_key'] = 'not_staying';
            $public['stayId'] = null;
            $public['bookingId'] = null;
            $public['conflictingUpcoming'] = 0;
            $public['now'] = null;

            $results[] = $public;
        }

        return $results;
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

    /** @return array<int, array<string, mixed>> */
    public function getBookings(int $guestId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT b.id, b.booking_code, b.room_id, r.room_no, rt.name AS room_type,
                    b.check_in_date, b.check_out_date, b.check_out_time,
                    b.persons, b.rate, b.status, b.booking_source, b.referred_by_guest_id, b.other_source,
                    ref_g.name AS referred_by_guest_name, ref_g.phone AS referred_by_guest_phone,
                    b.advance_amount, b.advance_method, b.total_amount, b.created_at,
                    COALESCE(
                        (SELECT SUM(p.amount) FROM payments p WHERE p.reservation_id = b.id AND p.status = "successful" AND p.type IN ("advance", "balance", "extra")),
                        b.advance_amount,
                        0.00
                    ) AS total_paid
             FROM reservations b
             JOIN rooms r ON r.id = b.room_id
             LEFT JOIN room_types rt ON rt.id = r.room_type_id
             LEFT JOIN guests ref_g ON ref_g.id = b.referred_by_guest_id
             WHERE b.guest_id = :guest_id AND b.hotel_id = :hotel_id
             ORDER BY b.check_in_date DESC, b.id DESC'
        );
        $stmt->execute([
            'guest_id' => $guestId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int, array<string, mixed>> */
    public function getStays(int $guestId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT s.id, s.reservation_id, b.booking_code, s.room_id, r.room_no, rt.name AS room_type,
                    s.check_in_date, s.checkout_planned, s.checkout_actual, s.checkout_time,
                    s.persons, s.rate, s.status, s.booking_source, s.referred_by_guest_id, s.other_source,
                    ref_g.name AS referred_by_guest_name, ref_g.phone AS referred_by_guest_phone,
                    s.payment_method, s.discount_amount, s.early_checkout_fee, s.created_at
             FROM stays s
             JOIN rooms r ON r.id = s.room_id
             LEFT JOIN room_types rt ON rt.id = r.room_type_id
             LEFT JOIN reservations b ON b.id = s.reservation_id
             LEFT JOIN guests ref_g ON ref_g.id = s.referred_by_guest_id
             WHERE s.guest_id = :guest_id AND s.hotel_id = :hotel_id
             ORDER BY s.check_in_date DESC, s.id DESC'
        );
        $stmt->execute([
            'guest_id' => $guestId,
            'hotel_id' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int, array<string, mixed>> */
    public function getReferredGuests(int $guestId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT 
                b.id AS reservation_id,
                b.booking_code,
                b.booking_code AS booking_id,
                b.guest_id,
                g.name AS guest_name,
                g.name AS name,
                g.phone AS guest_phone,
                g.phone AS phone,
                COALESCE(s_room.room_no, r.room_no) AS room_no,
                b.created_at AS booking_date,
                b.check_in_date,
                COALESCE(s.status, b.status) AS status
             FROM reservations b
             JOIN guests g ON g.id = b.guest_id
             LEFT JOIN rooms r ON r.id = b.room_id
             LEFT JOIN stays s ON s.id = (SELECT MAX(id) FROM stays WHERE reservation_id = b.id)
             LEFT JOIN rooms s_room ON s_room.id = s.room_id
             WHERE b.referred_by_guest_id = :guest_id
               AND b.hotel_id = :hotel_id
               AND g.hotel_id = :hotel_id_guest

             UNION ALL

             SELECT 
                NULL AS reservation_id,
                NULL AS booking_code,
                NULL AS booking_id,
                s.guest_id,
                g.name AS guest_name,
                g.name AS name,
                g.phone AS guest_phone,
                g.phone AS phone,
                r.room_no,
                s.created_at AS booking_date,
                s.check_in_date,
                s.status AS status
             FROM stays s
             JOIN guests g ON g.id = s.guest_id
             LEFT JOIN rooms r ON r.id = s.room_id
             WHERE s.referred_by_guest_id = :guest_id_stay
               AND s.hotel_id = :hotel_id_stay
               AND g.hotel_id = :hotel_id_stay_guest
               AND s.reservation_id IS NULL

             ORDER BY booking_date DESC, check_in_date DESC'
        );
        $stmt->execute([
            'guest_id' => $guestId,
            'hotel_id' => $hotelId,
            'hotel_id_guest' => $hotelId,
            'guest_id_stay' => $guestId,
            'hotel_id_stay' => $hotelId,
            'hotel_id_stay_guest' => $hotelId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array{id: int, name: string, phone: string}|null */
    public function findReferredBy(int $guestId, int $hotelId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT g.id, g.name, g.phone
             FROM reservations r
             JOIN guests g ON g.id = r.referred_by_guest_id
             WHERE r.guest_id = :guest_id AND r.hotel_id = :hotel_id AND r.referred_by_guest_id IS NOT NULL
             ORDER BY r.id DESC LIMIT 1'
        );
        $stmt->execute(['guest_id' => $guestId, 'hotel_id' => $hotelId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row !== false && $row !== null) {
            return [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'phone' => (string) $row['phone'],
            ];
        }

        $stmt2 = $this->db->prepare(
            'SELECT g.id, g.name, g.phone
             FROM stays s
             JOIN guests g ON g.id = s.referred_by_guest_id
             WHERE s.guest_id = :guest_id AND s.hotel_id = :hotel_id AND s.referred_by_guest_id IS NOT NULL
             ORDER BY s.id DESC LIMIT 1'
        );
        $stmt2->execute(['guest_id' => $guestId, 'hotel_id' => $hotelId]);
        $row2 = $stmt2->fetch(PDO::FETCH_ASSOC);
        if ($row2 !== false && $row2 !== null) {
            return [
                'id' => (int) $row2['id'],
                'name' => (string) $row2['name'],
                'phone' => (string) $row2['phone'],
            ];
        }

        return null;
    }

    /** @return array<int, array<string, mixed>> */
    public function getPayments(int $guestId, int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.id,
                    p.hotel_id,
                    p.reservation_id,
                    p.stay_id,
                    p.parent_payment_id,
                    p.type,
                    p.amount,
                    p.method,
                    p.status,
                    p.received_by,
                    p.note,
                    p.reason,
                    p.created_at,
                    u.name AS received_by_name,
                    COALESCE(r.booking_code, s_res.booking_code, parent_r.booking_code, parent_s_res.booking_code) AS booking_code,
                    COALESCE(r_room.room_no, parent_r_room.room_no) AS reservation_room_no,
                    COALESCE(s_room.room_no, parent_s_room.room_no) AS stay_room_no
             FROM payments p
             LEFT JOIN users u ON u.id = p.received_by
             LEFT JOIN reservations r ON r.id = p.reservation_id
             LEFT JOIN rooms r_room ON r_room.id = r.room_id
             LEFT JOIN stays s ON s.id = p.stay_id
             LEFT JOIN reservations s_res ON s_res.id = s.reservation_id
             LEFT JOIN rooms s_room ON s_room.id = s.room_id
             LEFT JOIN payments parent_p ON parent_p.id = p.parent_payment_id
             LEFT JOIN reservations parent_r ON parent_r.id = parent_p.reservation_id
             LEFT JOIN rooms parent_r_room ON parent_r_room.id = parent_r.room_id
             LEFT JOIN stays parent_s ON parent_s.id = parent_p.stay_id
             LEFT JOIN reservations parent_s_res ON parent_s_res.id = parent_s.reservation_id
             LEFT JOIN rooms parent_s_room ON parent_s_room.id = parent_s.room_id
             WHERE p.hotel_id = :hotel_id
               AND (
                 (p.reservation_id IS NOT NULL AND r.guest_id = :guest_id_res)
                 OR
                 (p.stay_id IS NOT NULL AND s.guest_id = :guest_id_stay)
                 OR
                 (p.parent_payment_id IS NOT NULL AND (parent_r.guest_id = :guest_id_parent_res OR parent_s.guest_id = :guest_id_parent_stay))
               )
             ORDER BY p.created_at DESC, p.id DESC'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'guest_id_res' => $guestId,
            'guest_id_stay' => $guestId,
            'guest_id_parent_res' => $guestId,
            'guest_id_parent_stay' => $guestId,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findGenderForGuest(int $guestId): ?string
    {
        $stmt = $this->db->prepare(
            "SELECT gender FROM occupants WHERE guest_id = :guest_id AND gender IS NOT NULL AND TRIM(gender) != '' ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['guest_id' => $guestId]);
        $val = $stmt->fetchColumn();
        return ($val !== false && $val !== null && trim($val) !== '') ? trim($val) : null;
    }

    /** @return array{summary: array<string, int>, items: array<int, array<string, mixed>>, total_count: int} */
    public function getAllReferrals(int $hotelId, array $filters = []): array
    {
        $sql = "
            SELECT 
                b.id AS reservation_id,
                b.booking_code,
                b.booking_code AS booking_id,
                b.created_at AS booking_date,
                b.check_in_date AS scheduled_check_in,
                b.check_out_date AS scheduled_check_out,
                b.status AS reservation_status,
                b.booking_source,
                b.advance_amount,
                COALESCE((
                    SELECT SUM(CASE WHEN p.type = 'refund' THEN -p.amount ELSE p.amount END)
                    FROM payments p
                    WHERE p.reservation_id = b.id AND p.type IN ('advance', 'refund') AND p.status = 'successful'
                ), 0) AS advance_paid,
                b.guest_id AS referred_guest_id,
                g_referred.name AS referred_guest_name,
                g_referred.phone AS referred_guest_phone,
                b.referred_by_guest_id AS referrer_id,
                g_referrer.name AS referrer_name,
                g_referrer.phone AS referrer_phone,
                COALESCE(s_room.room_no, r.room_no) AS room_no,
                s.id AS stay_id,
                s.status AS stay_status,
                s.check_in_date AS actual_check_in_date,
                s.created_at AS actual_check_in_time,
                s.checkout_actual AS actual_check_out_date,
                s.updated_at AS actual_check_out_time
            FROM reservations b
            JOIN guests g_referred ON g_referred.id = b.guest_id
            JOIN guests g_referrer ON g_referrer.id = b.referred_by_guest_id
            LEFT JOIN rooms r ON r.id = b.room_id
            LEFT JOIN stays s ON s.id = (SELECT MAX(id) FROM stays WHERE reservation_id = b.id)
            LEFT JOIN rooms s_room ON s_room.id = s.room_id
            WHERE b.hotel_id = :hotel_id
              AND b.referred_by_guest_id IS NOT NULL
            ORDER BY b.created_at DESC, b.id DESC
        ";

        $stmt = $this->db->prepare($sql);
        $stmt->execute(['hotel_id' => $hotelId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $totalBookings = count($rows);
        $uniqueGuestsMap = [];
        $arrivedGuestsMap = [];
        $upcomingBookings = 0;

        $items = [];
        foreach ($rows as $row) {
            $guestId = (int) $row['referred_guest_id'];
            $uniqueGuestsMap[$guestId] = true;

            $hasArrived = false;
            $status = 'Upcoming';
            $statusCode = 'upcoming';

            if ($row['stay_id'] !== null) {
                if ($row['stay_status'] === 'in_house') {
                    $status = 'In-House';
                    $statusCode = 'in_house';
                    $hasArrived = true;
                } elseif ($row['stay_status'] === 'checked_out') {
                    $status = 'Checked Out';
                    $statusCode = 'checked_out';
                    $hasArrived = true;
                } elseif ($row['stay_status'] === 'cancelled' || $row['reservation_status'] === 'cancelled') {
                    $status = 'Cancelled';
                    $statusCode = 'cancelled';
                    $hasArrived = false;
                } else {
                    $status = 'In-House';
                    $statusCode = 'in_house';
                    $hasArrived = true;
                }
            } else {
                if ($row['reservation_status'] === 'checked_in') {
                    $status = 'In-House';
                    $statusCode = 'in_house';
                    $hasArrived = true;
                } elseif ($row['reservation_status'] === 'cancelled') {
                    $status = 'Cancelled';
                    $statusCode = 'cancelled';
                } elseif ($row['reservation_status'] === 'no_show') {
                    $status = 'No-Show';
                    $statusCode = 'no_show';
                } else {
                    // pending
                    $hasAdvance = (float) ($row['advance_paid'] ?? $row['advance_amount'] ?? 0) > 0;
                    if ($hasAdvance) {
                        $status = 'Confirmed';
                        $statusCode = 'confirmed';
                    } else {
                        $status = 'Upcoming';
                        $statusCode = 'upcoming';
                    }
                }
            }

            if ($hasArrived) {
                $arrivedGuestsMap[$guestId] = true;
            }

            if ($statusCode === 'upcoming' || $statusCode === 'confirmed' || ($row['reservation_status'] === 'pending' && !$hasArrived)) {
                $upcomingBookings++;
            }

            $actualCheckIn = null;
            if ($hasArrived) {
                $actualCheckIn = $row['actual_check_in_time'] ?: ($row['actual_check_in_date'] ? $row['actual_check_in_date'] . ' 12:00:00' : null);
            }

            $actualCheckOut = null;
            if ($statusCode === 'checked_out') {
                $actualCheckOut = $row['actual_check_out_time'] ?: ($row['actual_check_out_date'] ? $row['actual_check_out_date'] . ' 11:00:00' : null);
            }

            $items[] = array_merge($row, [
                'status' => $status,
                'status_code' => $statusCode,
                'has_arrived' => $hasArrived,
                'actual_check_in' => $actualCheckIn,
                'actual_check_out' => $actualCheckOut,
            ]);
        }

        $summary = [
            'total_referral_bookings' => $totalBookings,
            'unique_referred_guests' => count($uniqueGuestsMap),
            'arrived_referred_guests' => count($arrivedGuestsMap),
            'upcoming_referral_bookings' => $upcomingBookings,
        ];

        // Apply filters if any
        $filteredItems = $items;

        $search = trim((string) ($filters['search'] ?? $filters['q'] ?? ''));
        if ($search !== '') {
            $searchLower = strtolower($search);
            $filteredItems = array_filter($filteredItems, static function ($it) use ($searchLower) {
                return str_contains(strtolower($it['referrer_name'] ?? ''), $searchLower)
                    || str_contains(strtolower($it['referrer_phone'] ?? ''), $searchLower)
                    || str_contains(strtolower($it['referred_guest_name'] ?? ''), $searchLower)
                    || str_contains(strtolower($it['referred_guest_phone'] ?? ''), $searchLower)
                    || str_contains(strtolower($it['booking_code'] ?? ''), $searchLower)
                    || str_contains((string) ($it['room_no'] ?? ''), $searchLower);
            });
        }

        $referrerSearch = trim((string) ($filters['referrer_search'] ?? ''));
        if ($referrerSearch !== '') {
            $refLower = strtolower($referrerSearch);
            $filteredItems = array_filter($filteredItems, static function ($it) use ($refLower) {
                return str_contains(strtolower($it['referrer_name'] ?? ''), $refLower)
                    || str_contains(strtolower($it['referrer_phone'] ?? ''), $refLower);
            });
        }

        $referredSearch = trim((string) ($filters['referred_search'] ?? ''));
        if ($referredSearch !== '') {
            $refGuestLower = strtolower($referredSearch);
            $filteredItems = array_filter($filteredItems, static function ($it) use ($refGuestLower) {
                return str_contains(strtolower($it['referred_guest_name'] ?? ''), $refGuestLower)
                    || str_contains(strtolower($it['referred_guest_phone'] ?? ''), $refGuestLower);
            });
        }

        $statusFilter = trim((string) ($filters['status'] ?? ''));
        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $statusFilterLower = strtolower($statusFilter);
            $filteredItems = array_filter($filteredItems, static function ($it) use ($statusFilterLower) {
                if ($statusFilterLower === 'arrived') {
                    return !empty($it['has_arrived']);
                }
                return strtolower($it['status_code'] ?? '') === $statusFilterLower
                    || strtolower($it['status'] ?? '') === $statusFilterLower;
            });
        }

        $dateFrom = trim((string) ($filters['date_from'] ?? $filters['from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? $filters['to'] ?? ''));
        $dateType = trim((string) ($filters['date_type'] ?? 'booking')); // 'booking' or 'check_in'

        if ($dateFrom !== '' || $dateTo !== '') {
            $filteredItems = array_filter($filteredItems, static function ($it) use ($dateFrom, $dateTo, $dateType) {
                $targetDate = $dateType === 'check_in'
                    ? substr((string) ($it['scheduled_check_in'] ?? ''), 0, 10)
                    : substr((string) ($it['booking_date'] ?? ''), 0, 10);

                if ($dateFrom !== '' && $targetDate < $dateFrom) {
                    return false;
                }
                if ($dateTo !== '' && $targetDate > $dateTo) {
                    return false;
                }
                return true;
            });
        }

        return [
            'summary' => $summary,
            'items' => array_values($filteredItems),
            'total_count' => count($filteredItems),
        ];
    }
}
