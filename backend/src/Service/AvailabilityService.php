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
class AvailabilityService
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

    /** Rooms with availability and readiness for [checkIn, checkOut), optionally filtered by room type — used by the New Booking room picker. */
    public function freeRooms(RoomRepository $rooms, int $hotelId, string $checkIn, string $checkOut, ?int $roomTypeId, ?int $excludeReservationId = null): array
    {
        $today = date('Y-m-d');
        $allRooms = $rooms->allForHotel($hotelId);
        $inHouse = method_exists($rooms, 'inHouseStaysByRoom') ? ($rooms->inHouseStaysByRoom($hotelId) ?? []) : [];
        $pending = method_exists($rooms, 'pendingReservationsByRoom') ? ($rooms->pendingReservationsByRoom($hotelId) ?? []) : [];

        $result = [];
        foreach ($allRooms as $room) {
            if ($roomTypeId !== null && (int) $room['room_type_id'] !== $roomTypeId) {
                continue;
            }

            $roomId = (int) $room['id'];
            $conflictingReservations = $this->reservations->overlapping($roomId, $checkIn, $checkOut, $excludeReservationId);
            $conflictingStays = $this->stays->overlapping($roomId, $checkIn, $checkOut, $today);
            $isAvailable = ($conflictingReservations === [] && $conflictingStays === []);

            $hk = (string) ($room['housekeeping_status'] ?? 'ok');
            $isReady = ($hk === 'ok');
            $isCleaning = ($hk === 'cleaning');
            $isMaintenance = ($hk === 'repair');

            $stay = $inHouse[$roomId] ?? null;
            $isOccupied = ($stay !== null);
            $isOverdue = ($isOccupied && (string) $stay['checkout_planned'] < $today);

            $roomPending = $pending[$roomId] ?? [];
            if ($excludeReservationId !== null) {
                $roomPending = array_values(array_filter($roomPending, static fn(array $p): bool => (int) ($p['id'] ?? 0) !== $excludeReservationId));
            }
            $nextReservation = $roomPending[0] ?? null;
            $conflictingRes = $conflictingReservations[0] ?? null;

            // Room cannot be booked if under maintenance, has overlap, or checkout is overdue
            $isBookable = ($isAvailable && !$isMaintenance && !$isOverdue);

            if ($isMaintenance) {
                $cardCondition = 'maintenance';
                $cardBadge = 'Repair';
                $cardDetail = 'Unavailable';
                $bookingStatus = 'maintenance';
                $blockedReason = "Room {$room['room_no']} is under maintenance and cannot be booked.";
                $turnoverNotice = null;
            } elseif ($isOccupied && $isOverdue) {
                $cardCondition = 'overdue';
                $cardBadge = 'Overdue';
                $cardDetail = 'Checkout pending';
                $bookingStatus = 'unavailable';
                $blockedReason = "Previous guest checkout is overdue. Checkout must be completed before new check-in.";
                $turnoverNotice = null;
            } elseif ($isOccupied && $nextReservation !== null) {
                $cardCondition = 'occupied_next_booking';
                $cardBadge = 'Occupied';
                $nextDate = date('j M', strtotime((string) $nextReservation['check_in_date']));
                $cardDetail = 'Next booking ' . $nextDate;
                $bookingStatus = $isBookable ? 'available_not_ready' : 'unavailable';
                if ($conflictingRes !== null) {
                    $blockedReason = "Room {$room['room_no']} already has a reservation (" . ($conflictingRes['booking_code'] ?? 'Booking') . ") until " . date('j M', strtotime((string) $conflictingRes['check_out_date'])) . '.';
                } elseif (!$isAvailable) {
                    $blockedReason = "Room {$room['room_no']} is occupied by {$stay['guest_name']} until " . date('j M', strtotime((string) $stay['checkout_planned'])) . '.';
                } else {
                    $blockedReason = null;
                }
                $turnoverNotice = "Consecutive booking after checkout on " . date('j M', strtotime((string) $stay['checkout_planned'])) . ". Actual check-in is subject to checkout completion and housekeeping readiness.";
            } elseif ($isOccupied) {
                $cardCondition = 'occupied';
                $cardBadge = 'Occupied';
                $leavesDate = date('j M', strtotime((string) $stay['checkout_planned']));
                $cardDetail = 'Leaves ' . $leavesDate;
                $bookingStatus = $isBookable ? 'available_not_ready' : 'unavailable';
                if (!$isAvailable) {
                    $blockedReason = "Room {$room['room_no']} is occupied by {$stay['guest_name']} until " . date('j M', strtotime((string) $stay['checkout_planned'])) . '.';
                } else {
                    $blockedReason = null;
                }
                $turnoverNotice = "Consecutive booking after checkout on " . date('j M', strtotime((string) $stay['checkout_planned'])) . ". Actual check-in is subject to checkout completion and housekeeping readiness.";
            } elseif ($conflictingRes !== null || !$isAvailable) {
                $cardCondition = 'reserved';
                $cardBadge = 'Booked';
                $untilDate = date('j M', strtotime((string) ($conflictingRes['check_out_date'] ?? ($conflictingStays[0]['effective_out'] ?? $checkOut))));
                $cardDetail = 'Until ' . $untilDate;
                $bookingStatus = 'unavailable';
                $blockedReason = "Reserved for requested dates until {$untilDate}" . ($conflictingRes && !empty($conflictingRes['booking_code']) ? " ({$conflictingRes['booking_code']})" : '') . '.';
                $turnoverNotice = null;
            } elseif ($isCleaning) {
                $cardCondition = 'cleaning';
                $cardBadge = 'Cleaning';
                $cardDetail = 'Not ready yet';
                $bookingStatus = 'available_not_ready';
                $blockedReason = null;
                $turnoverNotice = "Housekeeping in progress. Room must be marked ready before check-in.";
            } else {
                // Free and ready
                $cardCondition = 'free_ready';
                $cardBadge = 'Ready';
                $cardDetail = 'Available';
                $bookingStatus = 'available_ready';
                $blockedReason = null;
                $turnoverNotice = null;
            }

            $statusLabel = match ($bookingStatus) {
                'maintenance' => 'Maintenance (not bookable)',
                'unavailable' => 'Unavailable (already booked)',
                'available_ready' => 'Available + Ready',
                'available_not_ready' => 'Available + Not Ready',
            };

            $room['is_available'] = $isAvailable;
            $room['is_ready'] = $isReady;
            $room['is_bookable'] = $isBookable;
            $room['booking_status'] = $bookingStatus;
            $room['status_label'] = $statusLabel;

            $room['card_badge'] = $cardBadge;
            $room['card_detail'] = $cardDetail;
            $room['card_condition'] = $cardCondition;
            $room['selection_allowed'] = $isBookable;
            $room['selection_blocked_reason'] = $blockedReason;
            $room['turnover_notice'] = $turnoverNotice;

            $room['current_stay'] = $stay !== null ? [
                'stay_id' => (int) $stay['stay_id'],
                'guest_name' => $stay['guest_name'],
                'check_in_date' => $stay['check_in_date'],
                'checkout_planned' => $stay['checkout_planned'],
                'checkout_time' => $stay['checkout_time'] ?? '12:00:00',
                'is_overdue' => $isOverdue,
            ] : null;

            $room['next_reservation'] = $nextReservation !== null ? [
                'id' => (int) $nextReservation['id'],
                'booking_code' => $nextReservation['booking_code'] ?? null,
                'guest_name' => $nextReservation['guest_name'] ?? null,
                'check_in_date' => $nextReservation['check_in_date'],
                'check_out_date' => $nextReservation['check_out_date'],
                'check_out_time' => $nextReservation['check_out_time'] ?? '12:00:00',
            ] : null;

            $room['conflicting_reservation'] = $conflictingRes !== null ? [
                'id' => (int) $conflictingRes['id'],
                'booking_code' => $conflictingRes['booking_code'] ?? null,
                'guest_name' => $conflictingRes['guest_name'] ?? null,
                'check_in_date' => $conflictingRes['check_in_date'],
                'check_out_date' => $conflictingRes['check_out_date'],
            ] : null;

            $result[] = $room;
        }
        return $result;
    }
}
