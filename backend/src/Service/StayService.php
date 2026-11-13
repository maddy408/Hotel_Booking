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

    public function getGuestService(): GuestService
    {
        return $this->guestService;
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
        ?string $checkoutTime = null,
    ): array {
        // Enforce advance payment before check-in
        if ($advanceAmount <= 0) {
            throw ApiException::validation(
                ['advanceAmount' => 'Please enter and collect the advance amount before check-in.'],
                'Please enter and collect the advance amount before check-in.'
            );
        }

        $this->db->beginTransaction();
        try {
            $room = $this->rooms->find($roomId);
            if ($room === null || (int) $room['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Room not found.');
            }
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            // Authoritative check: room must not have another active stay
            $activeStay = $this->stays->findInHouseByRoom($roomId, true);
            if ($activeStay !== null) {
                throw ApiException::conflict("Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room.");
            }

            // Enforce room readiness
            if (($room['housekeeping_status'] ?? '') === 'repair') {
                $msg = "Room {$room['room_no']} is under maintenance and cannot be checked in.";
                throw ApiException::validation(['room' => $msg, 'housekeepingStatus' => $msg], $msg);
            }
            if (($room['housekeeping_status'] ?? '') !== 'ok') {
                $msg = "Room {$room['room_no']} is not ready (cleaning in progress). Housekeeping must mark the room ready before check-in.";
                throw ApiException::validation(['room' => $msg, 'housekeepingStatus' => $msg], $msg);
            }

            // Enforce max_persons
            $maxPersons = (int) ($room['max_persons'] ?? 2);
            if ($persons > $maxPersons) {
                $msg = "This room allows a maximum of {$maxPersons} persons.";
                throw ApiException::validation(['persons' => $msg], $msg);
            }

            $today = date('Y-m-d');
            $checkoutPlanned = $this->addDays($today, max(1, $days));
            $this->availability->assertFree($roomId, $today, $checkoutPlanned);

            // Settings checkout hour
            $settings = $this->settings->find($hotelId);
            $defaultHour = (int) ($settings['checkout_hour'] ?? 12);
            $checkoutTime = $this->normalizeTime($checkoutTime, $defaultHour);

            $guest = $this->guestService->findOrCreate($hotelId, $guestPhone, $guestName, $idProofType, $idProofNumber, $city);

            $stayId = $this->stays->create(
                $hotelId, null, $roomId, (int) $guest['id'], $persons, $rate,
                $today, $checkoutPlanned, $userId, $checkoutTime
            );

            // Record successful advance payment
            $paymentId = $this->payments->record($hotelId, null, $stayId, 'advance', $advanceAmount, $advanceMethod, $userId);
            if ($paymentId <= 0) {
                throw ApiException::validation(
                    ['advanceAmount' => 'Please enter and collect the advance amount before check-in.'],
                    'Please enter and collect the advance amount before check-in.'
                );
            }
            $payment = $this->payments->find($paymentId);
            if ($payment === null || ($payment['status'] ?? '') !== 'successful') {
                throw ApiException::validation(
                    ['advanceAmount' => 'Please enter and collect the advance amount before check-in.'],
                    'Please enter and collect the advance amount before check-in.'
                );
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
     * recomputes checkout from the originally booked night count.
     * Enforces advance payment check and max_persons check.
     */
    public function checkInFromReservation(
        int $reservationId,
        int $hotelId,
        ?int $userId
    ): array {
        $this->db->beginTransaction();
        try {
            $reservation = $this->reservations->lockForUpdate($reservationId);
            if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
            if ($reservation['status'] !== 'pending') {
                throw ApiException::conflict('This booking can no longer be checked in.');
            }

            // Verify advance payment has been successfully recorded
            $netAdvance = $this->payments->netAdvanceForReservation($reservationId, $hotelId);
            if ($netAdvance <= 0) {
                throw ApiException::validation(
                    ['advanceAmount' => 'Please enter and collect the advance amount before check-in.'],
                    'Please enter and collect the advance amount before check-in.'
                );
            }

            $roomId = (int) $reservation['room_id'];
            $room = $this->rooms->find($roomId);
            if ($room === null || (int) $room['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Room not found.');
            }
            if ($this->rooms->lockById($roomId) === null) {
                throw ApiException::notFound('Room not found.');
            }

            // Authoritative check: room must not have another active stay
            $activeStay = $this->stays->findInHouseByRoom($roomId, true);
            if ($activeStay !== null) {
                throw ApiException::conflict("Room {$room['room_no']} is already occupied by another active stay. Complete the previous checkout before assigning this room.");
            }

            // Enforce room readiness
            if (($room['housekeeping_status'] ?? '') === 'repair') {
                $msg = "Room {$room['room_no']} is under maintenance and cannot be checked in.";
                throw ApiException::validation(['room' => $msg, 'housekeepingStatus' => $msg], $msg);
            }
            if (($room['housekeeping_status'] ?? '') !== 'ok') {
                $msg = "Room {$room['room_no']} is not ready (cleaning in progress). Housekeeping must mark the room ready before check-in.";
                throw ApiException::validation(['room' => $msg, 'housekeepingStatus' => $msg], $msg);
            }

            // Enforce max_persons
            $maxPersons = (int) ($room['max_persons'] ?? 2);
            if ((int) $reservation['persons'] > $maxPersons) {
                $msg = "This room allows a maximum of {$maxPersons} persons.";
                throw ApiException::validation(['persons' => $msg], $msg);
            }

            $today = date('Y-m-d');
            $nights = BillingService::nightsBetween($reservation['check_in_date'], $reservation['check_out_date']);
            $checkoutPlanned = $this->addDays($today, $nights);
            $checkoutTime = $reservation['check_out_time'] ?? '12:00:00';

            $this->availability->assertFree($roomId, $today, $checkoutPlanned, excludeReservationId: $reservationId);

            $stayId = $this->stays->create(
                $hotelId, $reservationId, $roomId, (int) $reservation['guest_id'],
                (int) $reservation['persons'], (float) $reservation['rate'], $today, $checkoutPlanned, $userId,
                $checkoutTime
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

    public function updateStayCheckout(int $stayId, int $hotelId, string $checkoutPlanned, string $checkoutTime, ?int $userId): array
    {
        $this->db->beginTransaction();
        try {
            $stay = $this->stays->lockForUpdate($stayId);
            if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Stay not found.');
            }
            if ($stay['status'] !== 'in_house') {
                throw ApiException::conflict('Only a current stay can be updated.');
            }

            $settings = $this->settings->find($hotelId);
            $defaultHour = (int) ($settings['checkout_hour'] ?? 12);
            $checkoutTime = $this->normalizeTime($checkoutTime, $defaultHour);

            $today = date('Y-m-d');
            if ($checkoutPlanned < $today) {
                throw ApiException::validation(['checkoutPlanned' => 'Checkout date cannot be in the past.']);
            }

            if ($checkoutPlanned > $stay['checkout_planned']) {
                $this->availability->assertFree((int) $stay['room_id'], $stay['checkout_planned'], $checkoutPlanned, excludeStayId: $stayId);
            }

            $this->stays->updateCheckout($stayId, $checkoutPlanned, $checkoutTime);
            $this->audit->log($hotelId, $userId, 'stay_update_checkout', 'stay', $stayId, $stay, ['checkout_planned' => $checkoutPlanned, 'checkout_time' => $checkoutTime]);
            $this->db->commit();
            return $this->stays->findWithDetails($stayId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function earlyCheckoutPreview(
        int $stayId,
        int $hotelId,
        ?string $checkoutDate = null,
        ?float $overrideDiscount = null,
        ?float $overrideFee = null
    ): array {
        $stay = $this->stays->findWithDetails($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        $targetDate = $checkoutDate ?? date('Y-m-d');
        $bill = $this->billing->computeBill($stay, $targetDate, $overrideFee, $overrideDiscount);

        $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;
        $allPayments = $this->payments->forStayWithReservation($stayId, $reservationId);
        $successfulPayments = [];
        $pendingPayments = [];
        $failedPayments = [];
        $refundHistory = [];

        foreach ($allPayments as $p) {
            if ($p['type'] === 'refund') {
                $refundHistory[] = $p;
            } else {
                if ($p['status'] === 'successful') {
                    $p['refundable_balance'] = $this->payments->remainingBalanceForPayment((int) $p['id']);
                    $successfulPayments[] = $p;
                } elseif ($p['status'] === 'pending') {
                    $pendingPayments[] = $p;
                } else {
                    $failedPayments[] = $p;
                }
            }
        }

        return [
            'stay' => $stay,
            'bill' => $bill,
            'originalCheckIn' => $stay['check_in_date'],
            'originalPlannedCheckout' => $stay['checkout_planned'],
            'actualCheckoutDate' => $targetDate,
            'actualCheckoutTime' => date('H:i:s'),
            'actualNightsStayed' => $bill['nights'],
            'plannedNights' => $bill['plannedNights'],
            'unusedNights' => $bill['unusedNights'],
            'isEarlyCheckout' => $bill['isEarlyCheckout'],
            'originalRoomRate' => $bill['roomRate'],
            'actualRoomCharges' => $bill['roomAmount'],
            'additionalStayCharges' => $bill['extrasAmount'],
            'additionalCharges' => $bill['extrasAmount'],
            'discounts' => $bill['discountAmount'],
            'taxes' => round($bill['roomGstAmount'] + $bill['extrasGstAmount'], 2),
            'earlyCheckoutFee' => $bill['earlyCheckoutFee'],
            'totalInvoiceAmount' => $bill['total'],
            'advanceSuccessfullyPaid' => $bill['advancePaid'],
            'otherSuccessfulPayments' => $bill['otherPayments'],
            'totalSuccessfulPayments' => $bill['totalSuccessfulPayments'],
            'previouslyRefundedAmount' => $bill['previouslyRefunded'],
            'totalNetPayments' => $bill['netPaid'],
            'outstandingBalance' => $bill['outstandingBalance'],
            'eligibleRefundAmount' => $bill['eligibleRefund'],
            'successfulPayments' => $successfulPayments,
            'pendingPayments' => $pendingPayments,
            'failedPayments' => $failedPayments,
            'refundHistory' => $refundHistory,
        ];
    }

    public function applyDiscount(int $stayId, int $hotelId, float $amount, ?string $reason, ?int $userId): array
    {
        if ($amount < 0) {
            throw ApiException::validation(['discountAmount' => 'Discount amount cannot be negative.']);
        }
        $this->db->beginTransaction();
        try {
            $stay = $this->stays->lockForUpdate($stayId);
            if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Stay not found.');
            }
            if ($stay['status'] !== 'in_house') {
                throw ApiException::conflict('Discounts can only be applied to a current stay.');
            }
            $this->stays->applyDiscount($stayId, $amount, $reason);
            $this->audit->log($hotelId, $userId, 'discount', 'stay', $stayId, $stay, ['discount_amount' => $amount, 'reason' => $reason]);
            $this->db->commit();
            return $this->billing->computeBill($this->stays->find($stayId));
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function refundSummary(int $stayId, int $hotelId): array
    {
        $stay = $this->stays->findWithDetails($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }
        $bill = $this->billing->computeBill($stay);
        $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;
        $allPayments = $this->payments->forStayWithReservation($stayId, $reservationId);

        $successfulPayments = [];
        $pendingPayments = [];
        $failedPayments = [];
        $refundHistory = [];
        $totalSuccessful = 0.0;
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
                    $totalSuccessful += (float) $p['amount'];
                } elseif ($p['status'] === 'pending') {
                    $pendingPayments[] = $p;
                } else {
                    $failedPayments[] = $p;
                }
            }
        }

        $eligibleRefund = $bill['eligibleRefund'];

        return [
            'stay' => $stay,
            'bill' => $bill,
            'totalSuccessfulPayments' => round($totalSuccessful, 2),
            'previouslyRefundedAmount' => round($totalRefunded, 2),
            'finalEligibleRefundAmount' => round($eligibleRefund, 2),
            'successfulPayments' => $successfulPayments,
            'pendingPayments' => $pendingPayments,
            'failedPayments' => $failedPayments,
            'refundHistory' => $refundHistory,
        ];
    }

    public function processRefund(
        int $stayId,
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
            $stay = $this->stays->lockForUpdate($stayId);
            if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Stay not found.');
            }

            $bill = $this->billing->computeBill($stay);
            $eligibleRefund = $bill['eligibleRefund'];

            if ($status === 'successful' && $amount > $eligibleRefund) {
                throw ApiException::badRequest(
                    sprintf('Refund amount ₹%s exceeds eligible refund amount of ₹%s.', number_format($amount, 2), number_format($eligibleRefund, 2))
                );
            }

            $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;

            if ($parentPaymentId !== null) {
                $parent = $this->payments->lockForUpdate($parentPaymentId);
                if ($parent === null || ((int) ($parent['stay_id'] ?? 0) !== $stayId && (int) ($parent['reservation_id'] ?? 0) !== $reservationId)) {
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
                $allPayments = $this->payments->forStayWithReservation($stayId, $reservationId);
                foreach ($allPayments as $p) {
                    if ($p['status'] === 'successful' && $p['type'] !== 'refund') {
                        $rem = $this->payments->remainingBalanceForPayment((int) $p['id']);
                        if ($rem >= $amount) {
                            $parentPaymentId = (int) $p['id'];
                            break;
                        }
                    }
                }
                if ($parentPaymentId === null) {
                    foreach ($allPayments as $p) {
                        if ($p['status'] === 'successful' && $p['type'] !== 'refund') {
                            $parentPaymentId = (int) $p['id'];
                            break;
                        }
                    }
                }
            }

            $paymentId = $this->payments->record(
                $hotelId,
                $reservationId,
                $stayId,
                'refund',
                $amount,
                $method,
                $userId,
                $reason ?? 'Stay refund',
                $status,
                $parentPaymentId,
                $reason
            );

            $this->audit->log(
                $hotelId,
                $userId,
                'refund',
                'stay',
                $stayId,
                ['status' => $stay['status']],
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
            return $this->refundSummary($stayId, $hotelId);
        } catch (\Throwable $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    public function checkout(
        int $stayId,
        int $hotelId,
        string $paymentMethod,
        ?string $guestGstin,
        ?int $userId,
        ?float $amount = null,
        ?string $actualCheckoutDate = null,
        ?float $discountAmount = null,
        ?string $discountReason = null,
        ?float $earlyCheckoutFee = null,
        ?int $refundParentPaymentId = null,
        ?string $refundReason = null
    ): array {
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

            $actualDate = $actualCheckoutDate ?? date('Y-m-d');
            $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;

            // 1. Retrieve the bill based on actual checkout date, fee and discounts
            $initialBill = $this->billing->computeBill($stay, $actualDate, $earlyCheckoutFee, $discountAmount);
            $outstanding = round((float) $initialBill['balance'], 2);
            $advancePaid = round((float) $initialBill['advancePaid'], 2);

            // 2. Validate the exact remaining amount - reject partial or excessive payments
            if ($amount !== null) {
                $submittedAmount = round((float) $amount, 2);
                if ($outstanding > 0 && $submittedAmount < $outstanding) {
                    throw ApiException::badRequest(
                        sprintf(
                            'Partial payment is not allowed. Outstanding balance of ₹%s must be paid in full to complete checkout.',
                            number_format($outstanding, 2)
                        )
                    );
                }
                if ($outstanding > 0 && $submittedAmount > $outstanding) {
                    throw ApiException::badRequest(
                        sprintf(
                            'Payment amount of ₹%s exceeds outstanding balance of ₹%s.',
                            number_format($submittedAmount, 2),
                            number_format($outstanding, 2)
                        )
                    );
                }
                if ($outstanding <= 0 && $submittedAmount > 0) {
                    throw ApiException::badRequest('Bill is already fully paid. No additional payment is required.');
                }
            }

            // 3. Record payment or refund using the existing payment workflow
            $refundIssued = 0.0;
            if ($outstanding > 0) {
                $paymentId = $this->payments->record(
                    $hotelId,
                    $reservationId,
                    $stayId,
                    'balance',
                    $outstanding,
                    $paymentMethod,
                    $userId,
                    'Checkout balance payment'
                );

                if ($paymentId <= 0) {
                    throw ApiException::internal('Failed to record checkout payment.');
                }
                $recordedPayment = $this->payments->find($paymentId);
                if ($recordedPayment === null || ($recordedPayment['status'] ?? '') !== 'successful') {
                    throw ApiException::internal('Payment recording failed or payment status is not successful. Checkout remains incomplete.');
                }
            } elseif ($outstanding < 0) {
                $refundIssued = abs($outstanding);
                // Validate or locate parent payment for refund
                if ($refundParentPaymentId !== null) {
                    $parent = $this->payments->lockForUpdate($refundParentPaymentId);
                    if ($parent === null || ((int) ($parent['stay_id'] ?? 0) !== $stayId && (int) ($parent['reservation_id'] ?? 0) !== $reservationId)) {
                        throw ApiException::notFound('Original payment not found.');
                    }
                    $parentBalance = $this->payments->remainingBalanceForPayment($refundParentPaymentId);
                    if ($refundIssued > $parentBalance) {
                        throw ApiException::badRequest(
                            sprintf('Refund amount ₹%s exceeds remaining balance ₹%s on original payment #%d.', number_format($refundIssued, 2), number_format($parentBalance, 2), $refundParentPaymentId)
                        );
                    }
                } else {
                    $allPayments = $this->payments->forStayWithReservation($stayId, $reservationId);
                    foreach ($allPayments as $p) {
                        if ($p['status'] === 'successful' && $p['type'] !== 'refund') {
                            $rem = $this->payments->remainingBalanceForPayment((int) $p['id']);
                            if ($rem >= $refundIssued) {
                                $refundParentPaymentId = (int) $p['id'];
                                break;
                            }
                        }
                    }
                    if ($refundParentPaymentId === null) {
                        foreach ($allPayments as $p) {
                            if ($p['status'] === 'successful' && $p['type'] !== 'refund') {
                                $refundParentPaymentId = (int) $p['id'];
                                break;
                            }
                        }
                    }
                }

                $paymentId = $this->payments->record(
                    $hotelId,
                    $reservationId,
                    $stayId,
                    'refund',
                    $refundIssued,
                    $paymentMethod,
                    $userId,
                    $refundReason ?? 'Checkout refund',
                    'successful',
                    $refundParentPaymentId,
                    $refundReason ?? 'Checkout refund'
                );
                if ($paymentId <= 0) {
                    throw ApiException::internal('Failed to record checkout refund.');
                }
                $recordedPayment = $this->payments->find($paymentId);
                if ($recordedPayment === null || ($recordedPayment['status'] ?? '') !== 'successful') {
                    throw ApiException::internal('Payment recording failed or refund status is not successful. Checkout remains incomplete.');
                }
            }

            // 4. Recalculate the invoice balance
            $finalBill = $this->billing->computeBill($stay, $actualDate, $earlyCheckoutFee, $discountAmount);
            $finalBalance = round((float) $finalBill['balance'], 2);

            // 5. Complete checkout only if the balance is zero
            if ($finalBalance > 0) {
                throw ApiException::badRequest(
                    sprintf(
                        'Checkout cannot be completed. An outstanding balance of ₹%s remains.',
                        number_format($finalBalance, 2)
                    )
                );
            }

            $effDiscount = $discountAmount !== null ? $discountAmount : (float) ($stay['discount_amount'] ?? 0.0);
            $effReason = $discountReason ?? ($stay['discount_reason'] ?? null);
            $effFee = $finalBill['earlyCheckoutFee'];

            $this->stays->checkout($stayId, $actualDate, $paymentMethod, $effDiscount, $effReason, $effFee);
            $this->rooms->updateHousekeeping($roomId, 'cleaning', null);
            $this->hkLogs->log($roomId, 'cleaning', null, $userId);

            // If originating reservation exists, adjust its check_out_date if needed so future dates are free
            if ($reservationId !== null) {
                $res = $this->reservations->find($reservationId);
                if ($res !== null && $actualDate > $res['check_in_date'] && $res['check_out_date'] > $actualDate) {
                    $this->reservations->update(
                        $reservationId,
                        (int) $res['room_id'],
                        $res['check_in_date'],
                        $actualDate,
                        (int) $res['persons'],
                        (float) $res['rate'],
                        (float) $res['advance_amount'],
                        $res['advance_method'],
                        $res['check_out_time'] ?? '12:00:00'
                    );
                }
            }

            $settings = $this->invoiceService->lockMutex($hotelId);
            $invoice = $this->invoiceService->issue($hotelId, $stayId, $settings, $finalBill, $guestGstin, $advancePaid, $refundIssued > 0 ? $refundIssued : null);

            $this->audit->log(
                $hotelId,
                $userId,
                'check_out',
                'stay',
                $stayId,
                ['status' => 'in_house'],
                [
                    'status' => 'checked_out',
                    'total' => $finalBill['total'],
                    'actual_checkout_date' => $actualDate,
                    'collected_at_checkout' => $outstanding > 0 ? $outstanding : 0,
                    'refunded_at_checkout' => $refundIssued,
                    'discount_amount' => $effDiscount,
                    'early_checkout_fee' => $effFee,
                    'payment_method' => $paymentMethod,
                ]
            );

            $this->db->commit();

            // 6. Return updated payment, invoice and checkout details
            $allPayments = $this->payments->forStayWithReservation($stayId, $reservationId);

            return [
                'stay' => $this->stays->findWithDetails($stayId),
                'bill' => $finalBill,
                'invoice' => $invoice,
                'payments' => $allPayments,
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
}
