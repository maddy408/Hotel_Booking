<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\HousekeepingLogRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;

final class StayService
{
    public function __construct(
        private readonly PDO $db,
        private readonly StayRepository $stays,
        private readonly ReservationRepository $reservations,
        private readonly RoomRepository $rooms,
        private readonly StayChargeRepository $charges,
        private readonly PaymentRepository $payments,
        private readonly HousekeepingLogRepository $hkLogs,
        private readonly SettingsRepository $settings,
        private readonly GuestService $guestService,
        private readonly AvailabilityService $availability,
        private readonly BillingService $billing,
        private readonly InvoiceService $invoiceService,
        private readonly AuditLogger $audit,
    ) {
    }

    public function directCheckIn(
        int $hotelId,
        int $roomId,
        string $guestPhone,
        string $guestName,
        string $idProofType,
        string $idProofNumber,
        ?string $city,
        int $persons,
        int $days,
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
            $today = date('Y-m-d');
            $checkoutPlanned = $this->addDays($today, max(1, $days));
            $this->availability->assertFree($roomId, $today, $checkoutPlanned);

            $guest = $this->guestService->findOrCreate($hotelId, $guestPhone, $guestName, $idProofType, $idProofNumber, $city);

            $stayId = $this->stays->create($hotelId, null, $roomId, (int) $guest['id'], $persons, $rate, $today, $checkoutPlanned, $userId);
            if ($advanceAmount > 0) {
                $this->payments->record($hotelId, null, $stayId, 'advance', $advanceAmount, $advanceMethod, $userId);
            }
            $this->audit->log($hotelId, $userId, 'check_in', 'stay', $stayId, null, ['room_id' => $roomId, 'guest_id' => $guest['id']]);

            $this->db->commit();
            return $this->stays->findWithDetails($stayId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Converting a booking into an actual stay always resets check-in to *today* and
     * recomputes checkout from the originally booked night count — matching the prototype
     * (a "not came" booking that finally shows up never backdates the stay).
     */
    public function checkInFromReservation(int $reservationId, int $hotelId, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $reservation = $this->reservations->lockForUpdate($reservationId);
            if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($reservation['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be checked in.');
            }
            $roomId = (int) $reservation['room_id'];
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            $today = date('Y-m-d');
            $nights = BillingService::nightsBetween($reservation['check_in_date'], $reservation['check_out_date']);
            $checkoutPlanned = $this->addDays($today, $nights);

            $this->availability->assertFree($roomId, $today, $checkoutPlanned, excludeReservationId: $reservationId);

            $stayId = $this->stays->create(
                $hotelId, $reservationId, $roomId, (int) $reservation['guest_id'],
                (int) $reservation['persons'], (float) $reservation['rate'], $today, $checkoutPlanned, $userId,
            );
            $this->reservations->markCheckedIn($reservationId);
            $this->audit->log($hotelId, $userId, 'check_in', 'stay', $stayId, null, ['from_reservation' => $reservationId]);

            $this->db->commit();
            return $this->stays->findWithDetails($stayId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function addExtra(int $stayId, int $hotelId, string $label, float $amount, bool $isTaxable, ?int $userId): array
    {
        $stay = $this->stays->lockForUpdate($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        if ($stay['status'] !== 'in_house') {
            throw ApiException::conflict('Extras can only be added to a current stay.');
        }
        $this->charges->add($stayId, $label, $amount, $isTaxable, $userId);
        return $this->billing->computeBill($this->stays->find($stayId));
    }

    public function removeExtra(int $stayId, int $chargeId, int $hotelId): array
    {
        $stay = $this->stays->lockForUpdate($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        if ($stay['status'] !== 'in_house') {
            throw ApiException::conflict('Extras can only be changed on a current stay.');
        }
        $this->charges->remove($chargeId, $stayId);
        return $this->billing->computeBill($this->stays->find($stayId));
    }

    public function extend(int $stayId, int $hotelId, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $stay = $this->stays->lockForUpdate($stayId);
            if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Stay not found.');
            }
            if ($stay['status'] !== 'in_house') {
                throw ApiException::conflict('Only a current stay can be extended.');
            }
            $today = date('Y-m-d');
            $from = max($stay['checkout_planned'], $today);
            $newOut = $this->addDays($from, 1);

            $this->availability->assertFree((int) $stay['room_id'], $from, $newOut, excludeStayId: $stayId);

            $this->stays->extend($stayId, $newOut);
            $this->db->commit();
            return $this->stays->findWithDetails($stayId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function checkout(int $stayId, int $hotelId, string $paymentMethod, ?string $guestGstin, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $stay = $this->stays->lockForUpdate($stayId);
            if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Stay not found.');
            }
            if ($stay['status'] !== 'in_house') {
                throw ApiException::conflict('This stay is already checked out.');
            }
            $roomId = (int) $stay['room_id'];
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            $today = date('Y-m-d');
            $bill = $this->billing->computeBill($stay, $today);

            if ($bill['balance'] > 0) {
                $this->payments->record($hotelId, null, $stayId, 'balance', $bill['balance'], $paymentMethod, $userId);
            } elseif ($bill['balance'] < 0) {
                $this->payments->record($hotelId, null, $stayId, 'refund', abs($bill['balance']), $paymentMethod, $userId);
            }

            $this->stays->checkout($stayId, $today, $paymentMethod);
            $this->rooms->updateHousekeeping($roomId, 'cleaning', null);
            $this->hkLogs->log($roomId, 'cleaning', null, $userId);

            $settings = $this->invoiceService->lockMutex($hotelId);
            $invoice = $this->invoiceService->issue($hotelId, $stayId, $settings, $bill, $guestGstin);

            $this->audit->log($hotelId, $userId, 'check_out', 'stay', $stayId, ['status' => 'in_house'], ['status' => 'checked_out', 'total' => $bill['total']]);

            $this->db->commit();
            return [
                'stay' => $this->stays->findWithDetails($stayId),
                'bill' => $bill,
                'invoice' => $invoice,
            ];
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function bill(int $stayId, int $hotelId): array
    {
        $stay = $this->stays->find($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        return $this->billing->computeBill($stay);
    }

    public function find(int $stayId, int $hotelId): array
    {
        $stay = $this->stays->findWithDetails($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        return $stay;
    }

    public function listDone(int $hotelId, ?string $from, ?string $to): array
    {
        return $this->stays->listDoneForHotel($hotelId, $from, $to);
    }

    private function addDays(string $date, int $days): string
    {
        return (new \DateTimeImmutable($date))->modify("+{$days} day")->format('Y-m-d');
    }
}
