<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\StayRepository;
use App\Support\ApiException;

/**
 * Overlap check for [checkIn, checkOut), mirroring the prototype's roomFree(): a room is
 * unavailable if any live reservation or in-house stay intersects the half-open interval
 * (so a checkout today and an arrival today never conflict — 12-noon turnover).
 *
 * Callers MUST run this inside a transaction that already holds RoomRepository::lockById()
 * on the room, or two concurrent requests can both see "free" before either commits.
 */
final class AvailabilityService
{
    public function __construct(
        private readonly ReservationRepository $reservations,
        private readonly StayRepository $stays,
    ) {
    }

    public function assertFree(int $roomId, string $checkIn, string $checkOut, ?int $excludeReservationId = null, ?int $excludeStayId = null): void
    {
        if ($checkOut <= $checkIn) {
            throw ApiException::validation(['checkOut' => 'Checkout date must be after check-in date.']);
        }
        $today = date('Y-m-d');

        $conflictingReservations = $this->reservations->overlapping($roomId, $checkIn, $checkOut, $excludeReservationId);
        if ($conflictingReservations !== []) {
            throw ApiException::conflict('This room is already booked for part of those dates. Pick another room or change the dates.');
        }

        $conflictingStays = $this->stays->overlapping($roomId, $checkIn, $checkOut, $today, $excludeStayId);
        if ($conflictingStays !== []) {
            throw ApiException::conflict('This room is occupied for part of those dates. Pick another room or change the dates.');
        }
    }

    public function isFree(int $roomId, string $checkIn, string $checkOut, ?int $excludeReservationId = null, ?int $excludeStayId = null): bool
    {
        try {
            $this->assertFree($roomId, $checkIn, $checkOut, $excludeReservationId, $excludeStayId);
            return true;
        } catch (ApiException) {
            return false;
        }
    }

    /** Rooms free for [checkIn, checkOut), optionally filtered by room type — used by the New Booking room picker. */
    public function freeRooms(RoomRepository $rooms, int $hotelId, string $checkIn, string $checkOut, ?int $roomTypeId, ?int $excludeReservationId = null): array
    {
        $free = [];
        foreach ($rooms->allForHotel($hotelId) as $room) {
            if ($room['housekeeping_status'] === 'repair') {
                continue;
            }
            if ($roomTypeId !== null && (int) $room['room_type_id'] !== $roomTypeId) {
                continue;
            }
            if ($this->isFree((int) $room['id'], $checkIn, $checkOut, $excludeReservationId)) {
                $free[] = $room;
            }
        }
        return $free;
    }
}
