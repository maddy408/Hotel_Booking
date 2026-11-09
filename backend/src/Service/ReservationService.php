<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayRepository;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;

final class ReservationService
{
    private readonly StayRepository $stays;

    public function __construct(
        private readonly PDO $db,
        private readonly ReservationRepository $reservations,
        private readonly RoomRepository $rooms,
        private readonly GuestService $guestService,
        private readonly AvailabilityService $availability,
        private readonly PaymentRepository $payments,
        private readonly SettingsRepository $settings,
        private readonly AuditLogger $audit,
        ?StayRepository $stays = null,
    ) {
        $this->stays = $stays ?? new StayRepository($db);
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
        ?string $checkOutTime = null,
        ?string $notes = null,
    ): array {
        $this->db->beginTransaction();
        try {
            $room = $this->rooms->find($roomId);
            if ($room === null || (int) $room['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Room not found.');
            }
            if (($room['housekeeping_status'] ?? '') === 'repair') {
                throw ApiException::conflict("Room {$room['room_no']} is under maintenance and cannot be booked.");
            }
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            $today = $this->hotelToday($hotelId);
            if ($checkIn < $today) {
                throw ApiException::validation(['checkIn' => 'Check-in date cannot be in the past.'], 'Check-in date cannot be in the past.');
            }
            if ($checkIn <= $today) {
                $activeStay = $this->stays->findInHouseByRoom($roomId, true);
                if ($activeStay !== null && $activeStay['checkout_planned'] > $checkIn) {
                    throw ApiException::conflict("Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room.");
                }
            }

            // Enforce max_persons
            $maxPersons = (int) ($room['max_persons'] ?? 2);
            if ($persons > $maxPersons) {
                $msg = "This room allows a maximum of {$maxPersons} persons.";
                throw ApiException::validation(['persons' => $msg], $msg);
            }

            // Normalize and validate checkout time
            $settings = $this->settings->find($hotelId);
            $defaultHour = (int) ($settings['checkout_hour'] ?? 12);
            $checkOutTime = $this->normalizeTime($checkOutTime, $defaultHour);

            $this->validateDatesAndTimes($checkIn, $checkOut, $checkOutTime);
            $this->availability->assertFree($roomId, $checkIn, $checkOut);

            // A phone booking has no ID proof yet — that's collected at actual check-in.
            $guest = $this->guestService->findOrCreateMinimal($hotelId, $guestPhone, $guestName);

            $id = $this->reservations->create(
                $hotelId, 'PENDING', $roomId, (int) $guest['id'], $checkIn, $checkOut, $persons, $rate,
                $advanceAmount, $advanceMethod, $userId, $checkOutTime, $notes,
            );
            $code = ($settings['booking_prefix'] ?? 'BK') . '-' . (1000 + $id);
            $this->reservations->setBookingCode($id, $code);

            if ($advanceAmount > 0) {
                $this->payments->record($hotelId, $id, null, 'advance', $advanceAmount, $advanceMethod, $userId);
            }

            $this->audit->log($hotelId, $userId, 'booking_create', 'reservation', $id, null, ['booking_code' => $code, 'notes' => $notes]);
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
        ?string $checkOutTime = null,
        ?string $guestName = null,
        ?string $guestPhone = null,
        ?string $notes = null,
        ?int $guestId = null,
    ): array {
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict("Only pending bookings can be edited. This booking is {$existing['status']}.");
            }

            $room = $this->rooms->find($roomId);
            if ($room === null || (int) $room['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Room not found.');
            }
            if (($room['housekeeping_status'] ?? '') === 'repair') {
                throw ApiException::conflict("Room {$room['room_no']} is under maintenance and cannot be booked.");
            }
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            $today = $this->hotelToday($hotelId);
            if ($checkIn !== $existing['check_in_date'] && $checkIn < $today) {
                throw ApiException::validation(['checkIn' => 'Check-in date cannot be in the past.'], 'Check-in date cannot be in the past.');
            }
            if ($checkIn <= $today) {
                $activeStay = $this->stays->findInHouseByRoom($roomId, true);
                if ($activeStay !== null && $activeStay['checkout_planned'] > $checkIn) {
                    throw ApiException::conflict("Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room.");
                }
            }

            // Enforce max_persons
            $maxPersons = (int) ($room['max_persons'] ?? 2);
            if ($persons > $maxPersons) {
                $msg = "This room allows a maximum of {$maxPersons} persons.";
                throw ApiException::validation(['persons' => $msg], $msg);
            }

            // Normalize and validate checkout time
            $existingTime = $existing['check_out_time'] ?? '12:00:00';
            $checkOutTime = $checkOutTime !== null ? $this->normalizeTime($checkOutTime, 12) : $existingTime;

            $this->validateDatesAndTimes($checkIn, $checkOut, $checkOutTime);
            $this->availability->assertFree($roomId, $checkIn, $checkOut, excludeReservationId: $reservationId);

            // Guest assignment / update
            $assignedGuestId = (int) $existing['guest_id'];
            if ($guestId !== null && $guestId > 0 && $guestId !== $assignedGuestId) {
                $targetGuest = $this->guestService->findByPhone($hotelId, (string) ($this->guestService->toPublic($this->guestService->findOrCreateMinimal($hotelId, '0000000000', 'placeholder'))['phone'] ?? ''));
                $target = $this->reservations->findWithDetails($reservationId);
                $assignedGuestId = $guestId;
            } elseif ($guestPhone !== null && trim($guestPhone) !== '' && $guestName !== null && trim($guestName) !== '') {
                $guestObj = $this->guestService->findOrCreateMinimal($hotelId, trim($guestPhone), trim($guestName));
                $assignedGuestId = (int) $guestObj['id'];
            } elseif ($guestName !== null && trim($guestName) !== '') {
                $this->guestService->update($hotelId, $assignedGuestId, ['name' => trim($guestName)], $userId);
            }

            $cleanNotes = $notes !== null ? trim($notes) : ($existing['notes'] ?? null);

            $this->reservations->update(
                $reservationId, $roomId, $checkIn, $checkOut, $persons, $rate,
                $advanceAmount, $advanceMethod, $checkOutTime, $cleanNotes, $assignedGuestId
            );

            $delta = round($advanceAmount - (float) $existing['advance_amount'], 2);
            if ($delta > 0) {
                $this->payments->record($hotelId, $reservationId, null, 'advance', $delta, $advanceMethod, $userId);
            } elseif ($delta < 0) {
                $this->payments->record($hotelId, $reservationId, null, 'refund', abs($delta), $advanceMethod, $userId);
            }

            $after = $this->reservations->findWithDetails($reservationId);
            $this->audit->log(
                $hotelId, $userId, 'booking_update', 'reservation', $reservationId,
                $existing,
                $after
            );
            $this->db->commit();
            return $after;
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function recordAdvancePayment(int $reservationId, int $hotelId, float $amount, string $method, ?int $userId): array
    {
        if ($amount <= 0) {
            throw ApiException::validation(['advanceAmount' => 'Advance payment must be greater than 0.'], 'Advance payment must be greater than 0.');
        }
        if (!in_array($method, ['cash', 'upi', 'card'], true)) {
            throw ApiException::validation(['advanceMethod' => 'Invalid payment method.'], 'Invalid payment method.');
        }
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict('This booking is no longer pending.');
            }

            $newAdvance = round((float) $existing['advance_amount'] + $amount, 2);
            $this->reservations->update(
                $reservationId,
                (int) $existing['room_id'],
                $existing['check_in_date'],
                $existing['check_out_date'],
                (int) $existing['persons'],
                (float) $existing['rate'],
                $newAdvance,
                $method,
                $existing['check_out_time'] ?? '12:00:00',
            );

            $paymentId = $this->payments->record($hotelId, $reservationId, null, 'advance', $amount, $method, $userId);
            if ($paymentId <= 0) {
                throw ApiException::validation(
                    ['advanceAmount' => 'Failed to record advance payment.'],
                    'Failed to record advance payment.'
                );
            }
            $payment = $this->payments->find($paymentId);
            if ($payment === null || ($payment['status'] ?? '') !== 'successful') {
                throw ApiException::validation(
                    ['advanceAmount' => 'Advance payment must be successfully recorded.'],
                    'Advance payment must be successfully recorded.'
                );
            }
            $this->audit->log($hotelId, $userId, 'advance_payment', 'reservation', $reservationId, $existing, ['amount' => $amount, 'method' => $method]);
            $this->db->commit();
            return $this->reservations->findWithDetails($reservationId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function cancellationPreview(int $reservationId, int $hotelId): array
    {
        $reservation = $this->reservations->findWithDetails($reservationId);
        if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Booking not found.');
        }
        $settings = $this->settings->find($hotelId) ?? [];
        return $this->calculateCancellation($reservation, $settings);
    }

    public function calculateCancellation(array $reservation, array $settings): array
    {
        $reservationId = (int) $reservation['id'];
        $rate = (float) $reservation['rate'];

        $successfulPayments = $this->payments->successfulPaymentsForReservation($reservationId);
        $totalSuccessfulPaid = 0.0;
        foreach ($successfulPayments as &$p) {
            $totalSuccessfulPaid += (float) $p['amount'];
            $p['refundable_balance'] = $this->payments->remainingBalanceForPayment((int) $p['id']);
        }
        unset($p);

        $totalRefunded = $this->payments->totalRefundedForReservation($reservationId);
        $eligiblePaid = max(0.0, round($totalSuccessfulPaid - $totalRefunded, 2));

        $pendingPayments = $this->payments->pendingPaymentsForReservation($reservationId);
        $failedPayments = $this->payments->failedPaymentsForReservation($reservationId);
        $allPayments = $this->payments->forReservation($reservationId);

        $deadlineHours = (int) ($settings['cancellation_deadline_hours'] ?? 24);
        $freeAllowed = (bool) ($settings['cancellation_free_allowed'] ?? 1);
        $feeType = (string) ($settings['cancellation_fee_type'] ?? 'none');
        $feeVal = (float) ($settings['cancellation_fee_value'] ?? 0.0);
        $lateFeeType = (string) ($settings['cancellation_late_fee_type'] ?? 'percentage');
        $lateFeeVal = (float) ($settings['cancellation_late_fee_value'] ?? 10.0);

        $checkInTime = $reservation['check_out_time'] ?? '12:00:00';
        $checkInDateTimeStr = $reservation['check_in_date'] . ' ' . $checkInTime;
        $checkInTs = strtotime($checkInDateTimeStr) ?: strtotime($reservation['check_in_date'] . ' 12:00:00');
        $nowTs = time();
        $hoursBefore = ($checkInTs - $nowTs) / 3600.0;
        $isBeforeDeadline = ($hoursBefore >= $deadlineHours);

        if ($eligiblePaid <= 0.0) {
            $cancellationFee = 0.0;
            $policyRule = 'No successful payments on record to deduct fee from.';
        } elseif ($isBeforeDeadline) {
            if ($freeAllowed || $feeType === 'none') {
                $cancellationFee = 0.0;
                $policyRule = "Free cancellation (more than {$deadlineHours} hours before check-in).";
            } else {
                $cancellationFee = $this->computeFeeAmount($feeType, $feeVal, $rate, $eligiblePaid);
                $policyRule = 'Standard cancellation fee applied.';
            }
        } else {
            $cancellationFee = $this->computeFeeAmount($lateFeeType, $lateFeeVal, $rate, $eligiblePaid);
            $policyRule = "Late cancellation fee applied (within {$deadlineHours} hours of check-in).";
        }

        $cancellationFee = min($eligiblePaid, round($cancellationFee, 2));
        $refundableAmount = max(0.0, round($eligiblePaid - $cancellationFee, 2));

        return [
            'reservation' => $reservation,
            'eligiblePaid' => $eligiblePaid,
            'totalSuccessfulPaid' => round($totalSuccessfulPaid, 2),
            'totalRefunded' => round($totalRefunded, 2),
            'successfulPayments' => $successfulPayments,
            'pendingPayments' => $pendingPayments,
            'failedPayments' => $failedPayments,
            'allPayments' => $allPayments,
            'isBeforeDeadline' => $isBeforeDeadline,
            'deadlineHours' => $deadlineHours,
            'hoursBeforeCheckIn' => round($hoursBefore, 1),
            'cancellationFee' => $cancellationFee,
            'refundableAmount' => $refundableAmount,
            'policyRule' => $policyRule,
        ];
    }

    private function computeFeeAmount(string $type, float $value, float $rate, float $eligiblePaid): float
    {
        return match ($type) {
            'fixed' => $value,
            'percentage' => round($eligiblePaid * ($value / 100.0), 2),
            'first_night' => $rate,
            default => 0.0,
        };
    }

    public function cancel(
        int $reservationId,
        int $hotelId,
        ?string $reason,
        float $refundAmount,
        string $refundMethod,
        ?int $userId,
        ?float $customFee = null,
        bool $processRefund = false,
        ?int $parentPaymentId = null
    ): array {
        $this->db->beginTransaction();
        try {
            $existing = $this->reservations->lockForUpdate($reservationId);
            if ($existing === null || (int) $existing['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($existing['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be cancelled.');
            }

            $settings = $this->settings->find($hotelId) ?? [];
            $calc = $this->calculateCancellation($existing, $settings);

            $cancellationFee = $customFee !== null ? max(0.0, min($calc['eligiblePaid'], round($customFee, 2))) : $calc['cancellationFee'];
            $refundableAmount = max(0.0, round($calc['eligiblePaid'] - $cancellationFee, 2));

            $cancelReason = $reason !== null && trim($reason) !== '' ? trim($reason) : 'Cancelled by front desk';
            $this->reservations->cancel($reservationId, $cancelReason, $cancellationFee, $refundableAmount, $userId);

            // If immediate refund was confirmed
            if ($processRefund && $refundAmount > 0) {
                if ($refundAmount > $refundableAmount) {
                    throw ApiException::badRequest(
                        sprintf('Refund amount ₹%s exceeds eligible refundable amount of ₹%s.', number_format($refundAmount, 2), number_format($refundableAmount, 2))
                    );
                }

                // Auto-determine or validate parent payment
                if ($parentPaymentId !== null) {
                    $parent = $this->payments->lockForUpdate($parentPaymentId);
                    if ($parent === null || (int) ($parent['reservation_id'] ?? 0) !== $reservationId) {
                        throw ApiException::notFound('Original payment not found.');
                    }
                    if ($parent['status'] !== 'successful' || $parent['type'] === 'refund') {
                        throw ApiException::badRequest('Only successful original payments can be refunded.');
                    }
                    $parentRem = $this->payments->remainingBalanceForPayment($parentPaymentId);
                    if ($refundAmount > $parentRem) {
                        throw ApiException::badRequest(
                            sprintf('Refund amount ₹%s exceeds remaining balance ₹%s on payment #%d.', number_format($refundAmount, 2), number_format($parentRem, 2), $parentPaymentId)
                        );
                    }
                } else {
                    $successful = $this->payments->successfulPaymentsForReservation($reservationId);
                    foreach ($successful as $p) {
                        $rem = $this->payments->remainingBalanceForPayment((int) $p['id']);
                        if ($rem >= $refundAmount) {
                            $parentPaymentId = (int) $p['id'];
                            break;
                        }
                    }
                    if ($parentPaymentId === null && !empty($successful)) {
                        $parentPaymentId = (int) $successful[0]['id'];
                    }
                }

                $this->payments->record(
                    $hotelId,
                    $reservationId,
                    null,
                    'refund',
                    $refundAmount,
                    $refundMethod,
                    $userId,
                    $cancelReason,
                    'successful',
                    $parentPaymentId,
                    $cancelReason
                );
            }

            $this->audit->log(
                $hotelId,
                $userId,
                'cancel',
                'reservation',
                $reservationId,
                $existing,
                [
                    'status' => 'cancelled',
                    'reason' => $cancelReason,
                    'cancellation_fee' => $cancellationFee,
                    'refundable_amount' => $refundableAmount,
                    'refund_processed' => $processRefund && $refundAmount > 0 ? $refundAmount : 0,
                ]
            );
            $this->db->commit();
            return $this->reservations->findWithDetails($reservationId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function refundSummary(int $reservationId, int $hotelId): array
    {
        $reservation = $this->reservations->findWithDetails($reservationId);
        if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Booking not found.');
        }

        $allPayments = $this->payments->forReservation($reservationId);
        $successfulPayments = [];
        $pendingPayments = [];
        $failedPayments = [];
        $refundHistory = [];
        $totalSuccessfulPaid = 0.0;
        $totalRefunded = 0.0;

        foreach ($allPayments as $p) {
            if ($p['type'] === 'refund') {
                $refundHistory[] = $p;
                if ($p['status'] === 'successful') {
                    $totalRefunded += (float) $p['amount'];
                }
            } else {
                if ($p['status'] === 'successful') {
                    $p['refundable_balance'] = $this->payments->remainingBalanceForPayment((int) $p['id']);
                    $successfulPayments[] = $p;
                    $totalSuccessfulPaid += (float) $p['amount'];
                } elseif ($p['status'] === 'pending') {
                    $pendingPayments[] = $p;
                } else {
                    $failedPayments[] = $p;
                }
            }
        }

        $cancellationFee = (float) ($reservation['cancellation_fee'] ?? 0.0);
        $refundableAmount = (float) ($reservation['refundable_amount'] ?? 0.0);

        if ($reservation['status'] === 'cancelled') {
            $finalEligibleRefund = max(0.0, round($refundableAmount - $totalRefunded, 2));
        } else {
            $finalEligibleRefund = max(0.0, round($totalSuccessfulPaid - $totalRefunded, 2));
        }

        return [
            'reservation' => $reservation,
            'totalSuccessfulPaid' => round($totalSuccessfulPaid, 2),
            'totalRefunded' => round($totalRefunded, 2),
            'cancellationFee' => $cancellationFee,
            'refundableAmount' => $refundableAmount,
            'finalEligibleRefund' => $finalEligibleRefund,
            'successfulPayments' => $successfulPayments,
            'pendingPayments' => $pendingPayments,
            'failedPayments' => $failedPayments,
            'refundHistory' => $refundHistory,
        ];
    }

    public function processRefund(
        int $reservationId,
        int $hotelId,
        float $amount,
        string $method,
        ?string $reason,
        ?int $parentPaymentId,
        ?int $userId,
        string $status = 'successful'
    ): array {
        if ($amount <= 0) {
            throw ApiException::validation(['amount' => 'Refund amount must be greater than zero.']);
        }
        if (!in_array($method, ['cash', 'upi', 'card'], true)) {
            throw ApiException::validation(['method' => 'Invalid refund payment method.']);
        }
        if (!in_array($status, ['successful', 'pending', 'failed'], true)) {
            throw ApiException::validation(['status' => 'Invalid refund status.']);
        }

        $this->db->beginTransaction();
        try {
            $reservation = $this->reservations->lockForUpdate($reservationId);
            if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }

            $alreadyRefunded = $this->payments->totalRefundedForReservation($reservationId);
            if ($reservation['status'] === 'cancelled') {
                $eligibleRefund = max(0.0, round((float) $reservation['refundable_amount'] - $alreadyRefunded, 2));
            } else {
                $totalPaid = (float) $this->payments->netAdvanceForReservation($reservationId, $hotelId);
                $eligibleRefund = max(0.0, $totalPaid);
            }

            if ($status === 'successful' && $amount > $eligibleRefund) {
                throw ApiException::badRequest(
                    sprintf('Refund amount of ₹%s exceeds eligible refund amount of ₹%s.', number_format($amount, 2), number_format($eligibleRefund, 2))
                );
            }

            if ($parentPaymentId !== null) {
                $parent = $this->payments->lockForUpdate($parentPaymentId);
                if ($parent === null || (int) ($parent['reservation_id'] ?? 0) !== $reservationId) {
                    throw ApiException::notFound('Original payment not found.');
                }
                if ($parent['status'] !== 'successful' || $parent['type'] === 'refund') {
                    throw ApiException::badRequest('Only successful original payments can be refunded.');
                }
                $parentBalance = $this->payments->remainingBalanceForPayment($parentPaymentId);
                if ($status === 'successful' && $amount > $parentBalance) {
                    throw ApiException::badRequest(
                        sprintf('Refund amount ₹%s exceeds remaining balance ₹%s on original payment #%d.', number_format($amount, 2), number_format($parentBalance, 2), $parentPaymentId)
                    );
                }
            } else {
                $successful = $this->payments->successfulPaymentsForReservation($reservationId);
                foreach ($successful as $p) {
                    $rem = $this->payments->remainingBalanceForPayment((int) $p['id']);
                    if ($rem >= $amount) {
                        $parentPaymentId = (int) $p['id'];
                        break;
                    }
                }
                if ($parentPaymentId === null && !empty($successful)) {
                    $parentPaymentId = (int) $successful[0]['id'];
                }
            }

            $paymentId = $this->payments->record(
                $hotelId,
                $reservationId,
                null,
                'refund',
                $amount,
                $method,
                $userId,
                $reason ?? 'Cancellation refund',
                $status,
                $parentPaymentId,
                $reason
            );

            $this->audit->log(
                $hotelId,
                $userId,
                'refund',
                'reservation',
                $reservationId,
                ['status' => $reservation['status']],
                [
                    'payment_id' => $paymentId,
                    'amount' => $amount,
                    'method' => $method,
                    'status' => $status,
                    'parent_payment_id' => $parentPaymentId,
                    'reason' => $reason,
                ]
            );

            $this->db->commit();
            return $this->refundSummary($reservationId, $hotelId);
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

    private function normalizeTime(?string $time, int $defaultHour = 12): string
    {
        if ($time === null || trim($time) === '') {
            return sprintf('%02d:00:00', $defaultHour);
        }
        $trimmed = trim($time);
        if (preg_match('/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/', $trimmed, $m)) {
            $h = (int) $m[1];
            $min = (int) $m[2];
            $s = isset($m[3]) ? (int) $m[3] : 0;
            if ($h >= 0 && $h < 24 && $min >= 0 && $min < 60 && $s >= 0 && $s < 60) {
                return sprintf('%02d:%02d:%02d', $h, $min, $s);
            }
        }
        $ts = strtotime($trimmed);
        if ($ts !== false) {
            return date('H:i:s', $ts);
        }
        return sprintf('%02d:00:00', $defaultHour);
    }

    public function hotelToday(int $hotelId): string
    {
        $settings = $this->settings->find($hotelId);
        $tzName = $settings['timezone'] ?? (string) \App\Config\Env::get('APP_TIMEZONE', 'Asia/Kolkata');
        try {
            $tz = new \DateTimeZone($tzName ?: 'Asia/Kolkata');
        } catch (\Throwable) {
            $tz = new \DateTimeZone('Asia/Kolkata');
        }
        return (new \DateTimeImmutable('now', $tz))->format('Y-m-d');
    }

    private function validateDatesAndTimes(string $checkIn, string $checkOut, string $checkOutTime): void
    {
        if ($checkOut <= $checkIn) {
            throw ApiException::validation(['checkOut' => 'Checkout date must be after check-in date.'], 'Checkout date must be after check-in date.');
        }
    }
}
