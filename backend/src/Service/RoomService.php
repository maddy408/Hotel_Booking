<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\HousekeepingLogRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Support\ApiException;
use App\Support\AuditLogger;

/**
 * Mirrors the prototype's room-status derivation:
 * Priority: occupied > repair > booked > cleaning > free (first match wins).
 */
final class RoomService
{
    private const MAX_BULK_ADD = 60;
    private const HK_TRANSITIONS = [
        'cleaning' => ['ok', 'repair'],
        'repair' => ['cleaning'],
    ];

    public function __construct(
        private readonly RoomRepository $rooms,
        private readonly RoomTypeRepository $roomTypes,
        private readonly HousekeepingLogRepository $hkLogs,
        private readonly AuditLogger $audit,
    ) {
    }

    /** @return array{rooms: array<int,array<string,mixed>>, counts: array<string,int>} */
    public function listRooms(int $hotelId): array
    {
        $today = date('Y-m-d');
        $rooms = $this->rooms->allForHotel($hotelId);
        $inHouse = $this->rooms->inHouseStaysByRoom($hotelId);
        $reservations = $this->rooms->pendingReservationsByRoom($hotelId);

        $counts = ['free' => 0, 'booked' => 0, 'occupied' => 0, 'cleaning' => 0, 'repair' => 0];
        $result = [];

        foreach ($rooms as $room) {
            $roomId = (int) $room['id'];
            $stay = $inHouse[$roomId] ?? null;

            $roomReservations = $reservations[$roomId] ?? [];
            $activeBooking = $roomReservations[0] ?? null;
            $nextBooking = $roomReservations[1] ?? null;

            // Priority order for primary room status:
            // 1. Occupied: active in-house stay exists (takes priority over Booked)
            // 2. Booked: active pending reservation exists for that room (regardless of booking date)
            // 3. Repair: housekeeping condition under maintenance (when not occupied or booked)
            // 4. Cleaning: housekeeping condition awaiting cleaning (when not occupied or booked)
            // 5. Free: available and ready
            $status = match (true) {
                $stay !== null => 'occupied',
                $activeBooking !== null => 'booked',
                $room['housekeeping_status'] === 'repair' => 'repair',
                $room['housekeeping_status'] === 'cleaning' => 'cleaning',
                default => 'free',
            };

            // Independent summary calculations:
            // - occupied: rooms with active in-house stays
            // - booked: rooms with active pending reservations that have not completed check-in
            // - repair / cleaning / free: based on housekeeping for rooms without an active stay or booking
            if ($stay !== null) {
                $counts['occupied']++;
            }
            if ($activeBooking !== null) {
                $counts['booked']++;
            }
            if ($stay === null && $activeBooking === null) {
                if ($room['housekeeping_status'] === 'repair') {
                    $counts['repair']++;
                } elseif ($room['housekeeping_status'] === 'cleaning') {
                    $counts['cleaning']++;
                } else {
                    $counts['free']++;
                }
            }

            $hasPendingBooking = ($activeBooking !== null);
            $pendingBookingDto = $hasPendingBooking ? [
                'id' => (int) ($activeBooking['id'] ?? 0),
                'bookingCode' => $activeBooking['booking_code'] ?? null,
                'guestName' => $activeBooking['guest_name'] ?? null,
                'checkInDate' => $activeBooking['check_in_date'] ?? null,
                'checkOutDate' => $activeBooking['check_out_date'] ?? null,
            ] : null;

            $dto = [
                'id' => $roomId,
                'roomNo' => (int) $room['room_no'],
                'floor' => (int) $room['floor'],
                'status' => $status,
                'housekeepingStatus' => $room['housekeeping_status'],
                'isReady' => ($room['housekeeping_status'] === 'ok'),
                'roomType' => [
                    'id' => (int) $room['room_type_id'],
                    'code' => $room['type_code'],
                    'name' => $room['type_name'],
                    'rate' => (float) $room['type_rate'],
                    'maxPersons' => (int) $room['max_persons'],
                ],
                'note' => $room['note'],
                'guestName' => null,
                'stayId' => null,
                'checkoutPlanned' => null,
                'checkoutTime' => null,
                'dueToday' => false,
                'bookingId' => null,
                'bookingCode' => null,
                'bookingCheckIn' => null,
                'hasPendingBooking' => $hasPendingBooking,
                'pendingBooking' => $pendingBookingDto,
                'nextBookingDate' => $stay !== null ? ($activeBooking['check_in_date'] ?? null) : ($nextBooking['check_in_date'] ?? null),
            ];

            if ($status === 'occupied') {
                $dto['guestName'] = $stay['guest_name'];
                $dto['stayId'] = (int) $stay['stay_id'];
                $dto['checkoutPlanned'] = $stay['checkout_planned'];
                $dto['checkoutTime'] = $stay['checkout_time'] ?? null;
                $dto['dueToday'] = $stay['checkout_planned'] <= $today;
            } elseif ($status === 'booked' && $activeBooking !== null) {
                $dto['guestName'] = $activeBooking['guest_name'];
                $dto['bookingId'] = (int) $activeBooking['id'];
                $dto['bookingCode'] = $activeBooking['booking_code'];
                $dto['bookingCheckIn'] = $activeBooking['check_in_date'];
            }

            $result[] = $dto;
        }

        return ['rooms' => $result, 'counts' => $counts];
    }

    public function getByRoomNo(int $hotelId, int $roomNo): array
    {
        $room = $this->rooms->findByRoomNo($hotelId, $roomNo);
        if ($room === null) {
            throw ApiException::notFound("Room {$roomNo} does not exist.");
        }
        return $room;
    }

    // ---- room types ----

    public function addRoomType(int $hotelId, string $name, float $rate, int $maxPersons): array
    {
        $code = $this->generateTypeCode($hotelId, $name);
        $id = $this->roomTypes->create($hotelId, $code, $name, $rate, $maxPersons);
        return $this->roomTypes->find($id);
    }

    public function updateRoomType(int $id, string $name, float $rate, int $maxPersons, int $userId, int $hotelId): array
    {
        $before = $this->roomTypes->find($id);
        if ($before === null || (int) $before['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Room type not found.');
        }
        $this->roomTypes->update($id, $name, $rate, $maxPersons);
        $after = $this->roomTypes->find($id);
        if ((float) $before['rate'] !== $rate) {
            $this->audit->log($hotelId, $userId, 'rate_change', 'room_type', $id, $before, $after);
        }
        return $after;
    }

    public function deleteRoomType(int $id, int $hotelId): void
    {
        $type = $this->roomTypes->find($id);
        if ($type === null || (int) $type['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Room type not found.');
        }
        if ($this->roomTypes->roomCount($id) > 0) {
            throw ApiException::conflict('Change the type of its rooms first.');
        }
        $this->roomTypes->delete($id);
    }

    private function generateTypeCode(int $hotelId, string $name): string
    {
        $base = strtoupper(preg_replace('/[^A-Z]/i', '', $name)) ?: 'RT';
        $base = substr($base, 0, 3);
        $code = $base;
        $i = 1;
        while ($this->roomTypes->findByCode($hotelId, $code) !== null) {
            $code = $base . $i++;
        }
        return $code;
    }

    // ---- rooms ----

    /** @return array{added:int, skipped:int[]} */
    public function bulkAddRooms(int $hotelId, int $floor, int $from, int $to, int $roomTypeId): array
    {
        if ($from <= 0 || $to < $from || ($to - $from) > self::MAX_BULK_ADD) {
            throw ApiException::validation(['range' => 'Enter a room number, or a range up to 60 rooms.']);
        }
        if ($this->roomTypes->find($roomTypeId) === null) {
            throw ApiException::validation(['roomTypeId' => 'Add a room type first.']);
        }
        $added = 0;
        $skipped = [];
        for ($no = $from; $no <= $to; $no++) {
            if ($this->rooms->roomNoExists($hotelId, $no)) {
                $skipped[] = $no;
                continue;
            }
            $this->rooms->insert($hotelId, $no, $floor, $roomTypeId);
            $added++;
        }
        return ['added' => $added, 'skipped' => $skipped];
    }

    public function changeRoomType(int $roomId, int $roomTypeId, int $hotelId): array
    {
        $room = $this->getOwnedRoom($roomId, $hotelId);
        $type = $this->roomTypes->find($roomTypeId);
        if ($type === null || (int) $type['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Room type not found.');
        }
        $maxPersons = (int) ($type['max_persons'] ?? 2);
        $activePersons = $this->rooms->maxActivePersons($roomId);
        if ($activePersons > $maxPersons) {
            throw ApiException::conflict("Cannot change room type: an active stay or booking in Room {$room['room_no']} has {$activePersons} persons, but {$type['name']} only allows {$maxPersons} persons.");
        }
        $this->rooms->updateType($roomId, $roomTypeId);
        return $this->rooms->find($roomId);
    }

    public function updateRoom(int $roomId, int $roomNo, int $floor, int $roomTypeId, ?string $note, int $hotelId, ?int $userId): array
    {
        $room = $this->getOwnedRoom($roomId, $hotelId);
        if ($roomNo !== (int) $room['room_no'] && $this->rooms->roomNoExists($hotelId, $roomNo)) {
            throw ApiException::conflict("Room {$roomNo} already exists.");
        }
        $type = $this->roomTypes->find($roomTypeId);
        if ($type === null || (int) $type['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Room type not found.');
        }
        $maxPersons = (int) ($type['max_persons'] ?? 2);
        $activePersons = $this->rooms->maxActivePersons($roomId);
        if ($activePersons > $maxPersons) {
            throw ApiException::conflict("Cannot change room type: an active stay or booking in Room {$room['room_no']} has {$activePersons} persons, but {$type['name']} only allows {$maxPersons} persons.");
        }
        $this->rooms->updateRoom($roomId, $roomNo, $floor, $roomTypeId, $note);
        $updated = $this->rooms->find($roomId);
        if ($userId !== null) {
            $this->audit->log($hotelId, $userId, 'room_update', 'room', $roomId, $room, $updated);
        }
        return $updated;
    }

    public function deleteRoom(int $roomId, int $hotelId, int $userId): void
    {
        $room = $this->getOwnedRoom($roomId, $hotelId);
        if ($this->rooms->liveReferenceCount($roomId) > 0) {
            throw ApiException::conflict("Room {$room['room_no']} has a guest or booking. It cannot be removed.");
        }
        $this->rooms->delete($roomId);
        $this->audit->log($hotelId, $userId, 'room_delete', 'room', $roomId, $room, null);
    }

    public function setHousekeeping(int $roomId, string $action, ?string $note, ?int $userId, int $hotelId): array
    {
        $room = $this->getOwnedRoom($roomId, $hotelId);
        $current = $room['housekeeping_status'];
        $target = $action === 'ready' ? 'ok' : $action;
        if (!in_array($target, ['ok', 'cleaning', 'repair'], true)) {
            throw ApiException::validation(['action' => 'Must be ready, cleaning or repair.']);
        }
        if ($target === 'cleaning' && $this->rooms->hasActiveStay($roomId)) {
            throw ApiException::conflict("Room {$room['room_no']} is currently occupied. Housekeeping cannot mark an occupied room as awaiting cleaning.");
        }
        if ($current !== 'ok' && !in_array($target, self::HK_TRANSITIONS[$current] ?? [], true)) {
            throw ApiException::conflict("Room {$room['room_no']} cannot move from {$current} to {$target} directly.");
        }
        $finalNote = $target === 'repair' ? (trim((string) $note) !== '' ? trim((string) $note) : 'Problem not written') : null;
        $this->rooms->updateHousekeeping($roomId, $target, $finalNote);
        $this->hkLogs->log($roomId, $target === 'ok' ? 'ready' : $target, $finalNote, $userId);
        return $this->rooms->find($roomId);
    }

    /** Fetches a room and confirms it belongs to the caller's hotel — 404s otherwise (never leaks existence across tenants). */
    private function getOwnedRoom(int $roomId, int $hotelId): array
    {
        $room = $this->rooms->find($roomId);
        if ($room === null || (int) $room['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Room not found.');
        }
        return $room;
    }
}
