<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;

final class ReservationService
{
    public function __construct(
        private readonly PDO $db,
        private readonly ReservationRepository $reservations,
        private readonly RoomRepository $rooms,
        private readonly GuestService $guestService,
        private readonly AvailabilityService $availability,
        private readonly PaymentRepository $payments,
        private readonly SettingsRepository $settings,
        private readonly AuditLogger $audit,
    ) {
    }

    public function create(
        int $hotelId,
        int $roomId,
        string $guestPhone,
        string $guestName,
        string $checkIn,
        string $checkOut,
        int $persons,
        float $rate,
        float $advanceAmount,
        string $advanceMethod,
        ?int $userId,
    ): array {
        $this->db->beginTransaction();
        try {
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }
            $this->availability->assertFree($roomId, $checkIn, $checkOut);

            // A phone booking has no ID proof yet — that's collected at actual check-in.
            $guest = $this->guestService->findOrCreateMinimal($hotelId, $guestPhone, $guestName);

            $settings = $this->settings->find($hotelId);
            $id = $this->reservations->create(
                $hotelId, 'PENDING', $roomId, (int) $guest['id'], $checkIn, $checkOut, $persons, $rate,
                $advanceAmount, $advanceMethod, $userId,
            );
            $code = ($settings['booking_prefix'] ?? 'BK') . '-' . (1000 + $id);
            $this->reservations->setBookingCode($id, $code);

            if ($advanceAmount > 0) {
                $this->payments->record($hotelId, $id, null, 'advance', $advanceAmount, $advanceMethod, $userId);
            }

            $this->audit->log($hotelId, $userId, 'booking_create', 'reservation', $id, null, ['booking_code' => $code]);
            $this->db->commit();
            return $this->reservations->findWithDetails($id);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function update(
        int $reservationId,
        int $hotelId,
        int $roomId,
        string $checkIn,
        string $checkOut,
        int $persons,
        float $rate,
        float $advanceAmount,
        string $advanceMethod,
        ?int $userId,
    ): array {
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be changed.');
            }
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }
            $this->availability->assertFree($roomId, $checkIn, $checkOut, excludeReservationId: $reservationId);

            $this->reservations->update($reservationId, $roomId, $checkIn, $checkOut, $persons, $rate, $advanceAmount, $advanceMethod);

            $delta = round($advanceAmount - (float) $existing['advance_amount'], 2);
            if ($delta > 0) {
                $this->payments->record($hotelId, $reservationId, null, 'advance', $delta, $advanceMethod, $userId);
            } elseif ($delta < 0) {
                $this->payments->record($hotelId, $reservationId, null, 'refund', abs($delta), $advanceMethod, $userId);
            }

            $this->audit->log($hotelId, $userId, 'booking_update', 'reservation', $reservationId, $existing, ['room_id' => $roomId, 'check_in' => $checkIn, 'check_out' => $checkOut]);
            $this->db->commit();
            return $this->reservations->findWithDetails($reservationId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function cancel(int $reservationId, int $hotelId, ?string $reason, float $refundAmount, string $refundMethod, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be cancelled.');
            }
            $this->reservations->cancel($reservationId, $reason ?? '');
            if ($refundAmount > 0) {
                $this->payments->record($hotelId, $reservationId, null, 'refund', $refundAmount, $refundMethod, $userId);
            }
            $this->audit->log($hotelId, $userId, 'cancel', 'reservation', $reservationId, $existing, ['status' => 'cancelled', 'reason' => $reason]);
            $this->db->commit();
            return $this->reservations->findWithDetails($reservationId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function markNoShow(int $reservationId, int $hotelId, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be marked no-show.');
            }
            if ($existing['check_in_date'] >= date('Y-m-d')) {
                throw ApiException::conflict('The arrival date has not passed yet.');
            }
            $this->reservations->markNoShow($reservationId);
            $this->audit->log($hotelId, $userId, 'no_show', 'reservation', $reservationId, $existing, ['status' => 'no_show']);
            $this->db->commit();
            return $this->reservations->findWithDetails($reservationId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function list(int $hotelId): array
    {
        return $this->reservations->listPending($hotelId);
    }

    public function find(int $id, int $hotelId): array
    {
        $reservation = $this->reservations->findWithDetails($id);
        if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Booking not found.');
        }
        return $reservation;
    }

    /** Rooms free for a given date range / type, for the New Booking room picker. */
    public function freeRooms(int $hotelId, string $checkIn, string $checkOut, ?int $roomTypeId, ?int $excludeReservationId = null): array
    {
        return $this->availability->freeRooms($this->rooms, $hotelId, $checkIn, $checkOut, $roomTypeId, $excludeReservationId);
    }
}
