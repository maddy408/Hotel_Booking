<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\HotelRepository;
use App\Repository\PaymentRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;

/**
 * Computes billing breakdown for a stay:
 * - Actual stay duration (nightsBetween check_in_date and actual/reference date)
 * - Configured early-checkout policy (refund eligibility for unused nights, fees)
 * - GST based on configured slabs (evaluated per nightly tariff)
 * - Extras (taxed based on individual category SAC classification, not room accommodation GST)
 * - Discounts
 * - Successful payments vs refunds -> Net payments
 * - Outstanding balance vs Eligible refund
 * - CGST / SGST / IGST tax breakup
 */
class BillingService
{
    private readonly ?HotelRepository $hotels;

    public function __construct(
        private readonly GstService $gst,
        private readonly StayChargeRepository $charges,
        private readonly PaymentRepository $payments,
        private readonly ?SettingsRepository $settings = null,
        mixed $hotels = null,
    ) {
        $this->hotels = ($hotels instanceof HotelRepository) ? $hotels : null;
    }

    public static function nightsBetween(string $checkIn, string $referenceDate): int
    {
        $a = new \DateTimeImmutable($checkIn);
        $b = new \DateTimeImmutable($referenceDate);
        $diff = (int) round(($b->getTimestamp() - $a->getTimestamp()) / 86400);
        return max(1, $diff);
    }

    /**
     * @return array{
     *   nights:int, plannedNights:int, billableNights:int, unusedNights:int, additionalNights:int,
     *   isEarlyCheckout:bool, isLateCheckout:bool, isNormalCheckout:bool, checkoutType:string,
     *   roomRate:float, roomAmount:float, gstRate:float, roomGstAmount:float,
     *   extrasAmount:float, extrasGstAmount:float, earlyCheckoutFee:float, discountAmount:float,
     *   total:float, advancePaid:float, otherPayments:float, totalSuccessfulPayments:float,
     *   previouslyRefunded:float, netPaid:float, balance:float, outstandingBalance:float,
     *   eligibleRefund:float, charges:array, isFullyPaid:bool
     * }
     */
    public function computeBill(
        array $stay,
        ?string $asOfDate = null,
        ?float $overrideEarlyCheckoutFee = null,
        ?float $overrideDiscount = null
    ): array {
        $hotelId = (int) $stay['hotel_id'];
        $rate = (float) $stay['rate'];
        $referenceDate = $stay['checkout_actual'] ?? $asOfDate ?? date('Y-m-d');

        if ($referenceDate < $stay['check_in_date']) {
            throw \App\Support\ApiException::validation([
                'actualCheckoutDate' => sprintf(
                    'Actual checkout date (%s) cannot be earlier than check-in date (%s).',
                    $referenceDate,
                    $stay['check_in_date']
                ),
            ]);
        }

        $actualNights = self::nightsBetween($stay['check_in_date'], $referenceDate);
        $plannedNights = self::nightsBetween($stay['check_in_date'], $stay['checkout_planned']);
        $isEarlyCheckout = ($referenceDate < $stay['checkout_planned']);
        $isLateCheckout = ($referenceDate > $stay['checkout_planned']);
        $isNormalCheckout = ($referenceDate === $stay['checkout_planned']);
        $checkoutType = $isEarlyCheckout ? 'early' : ($isLateCheckout ? 'late' : 'normal');

        $unusedNights = $isEarlyCheckout ? max(0, $plannedNights - $actualNights) : 0;
        $additionalNights = $isLateCheckout ? max(0, $actualNights - $plannedNights) : 0;

        $hotelSettings = $this->settings !== null ? ($this->settings->find($hotelId) ?? []) : [];
        $refundUnusedNights = (bool) ($hotelSettings['early_checkout_refund_unused_nights'] ?? 1);

        // If policy does not refund unused nights, charge for planned nights; otherwise charge for actual nights stayed
        $billableNights = ($isEarlyCheckout && !$refundUnusedNights) ? $plannedNights : $actualNights;
        $roomAmount = $billableNights * $rate;

        // Early checkout fee calculation - applies strictly to early checkout
        if (!$isEarlyCheckout && ($stay['status'] ?? '') !== 'checked_out') {
            $earlyCheckoutFee = 0.0;
        } elseif ($overrideEarlyCheckoutFee !== null) {
            $earlyCheckoutFee = $isEarlyCheckout ? max(0.0, round($overrideEarlyCheckoutFee, 2)) : 0.0;
        } elseif (isset($stay['early_checkout_fee']) && (float) $stay['early_checkout_fee'] > 0 && (($stay['status'] ?? '') === 'checked_out' || $isEarlyCheckout)) {
            $earlyCheckoutFee = (float) $stay['early_checkout_fee'];
        } elseif ($isEarlyCheckout) {
            $feeType = $hotelSettings['early_checkout_fee_type'] ?? 'none';
            $feeValue = (float) ($hotelSettings['early_checkout_fee_value'] ?? 0.0);
            $earlyCheckoutFee = match ($feeType) {
                'fixed' => $feeValue,
                'percentage' => round($rate * $unusedNights * ($feeValue / 100), 2),
                'one_night' => $rate,
                default => 0.0,
            };
        } else {
            $earlyCheckoutFee = 0.0;
        }

        // Determine room GST rate: use locked stay gst_rate if set (preserves confirmed bookings),
        // otherwise calculate from configured slabs using nightly tariff
        if (isset($stay['gst_rate']) && (float) $stay['gst_rate'] > 0) {
            $gstRate = (float) $stay['gst_rate'];
        } else {
            $slab = $this->gst->slabFor($hotelId, $rate);
            $gstRate = $slab['rate'];
        }
        $roomGstAmount = round($roomAmount * $gstRate, 2);

        $charges = $this->charges->forStay((int) $stay['id']);
        $extrasAmount = 0.0;
        $extrasGstAmount = 0.0;
        foreach ($charges as $charge) {
            $extrasAmount += (float) $charge['amount'];
            if (isset($charge['gst_amount']) && (float) $charge['gst_amount'] > 0) {
                // If precalculated on insertion
                $extrasGstAmount += (float) $charge['gst_amount'];
            } elseif (!empty($charge['is_taxable'])) {
                // Use individual charge category tax classification rate
                $extraTax = $this->gst->taxForExtraCharge($hotelId, (string) ($charge['label'] ?? ''), (float) $charge['amount'], true);
                $extrasGstAmount += (float) $extraTax['gst_amount'];
            }
        }
        $extrasGstAmount = round($extrasGstAmount, 2);

        // CGST / SGST / IGST tax breakup
        $totalTax = round($roomGstAmount + $extrasGstAmount, 2);
        $hotel = $this->hotels !== null ? $this->hotels->find($hotelId) : null;
        $guestGstin = $stay['guest_gstin'] ?? null;
        $taxBreakup = $this->gst->calculateTaxBreakup($totalTax, $hotel['gstin'] ?? null, $guestGstin, $hotel['place'] ?? null);

        // Discount
        if ($overrideDiscount !== null) {
            $discountAmount = max(0.0, round($overrideDiscount, 2));
        } elseif (isset($stay['discount_amount']) && (float) $stay['discount_amount'] > 0) {
            $discountAmount = (float) $stay['discount_amount'];
        } else {
            $discountAmount = 0.0;
        }

        $totalBeforeDiscount = $roomAmount + $roomGstAmount + $extrasAmount + $extrasGstAmount + $earlyCheckoutFee;
        $total = max(0.0, round($totalBeforeDiscount - $discountAmount, 2));

        $stayId = (int) $stay['id'];
        $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;

        $advancePaid = $this->payments->advancePaidForStay($stayId, $reservationId);
        $otherPayments = $this->payments->otherSuccessfulPaymentsForStay($stayId, $reservationId);
        $totalSuccessfulPayments = $this->payments->totalSuccessfulPaidForStay($stayId, $reservationId);
        $previouslyRefunded = $this->payments->totalRefundedForStay($stayId, $reservationId);
        $netPaid = $this->payments->netSettledForStay($stayId, $reservationId);

        $balance = round($total - $netPaid, 2);
        $outstandingBalance = $balance > 0 ? $balance : 0.0;
        $eligibleRefund = $balance < 0 ? abs($balance) : 0.0;

        return [
            'nights' => $actualNights,
            'plannedNights' => $plannedNights,
            'billableNights' => $billableNights,
            'unusedNights' => $unusedNights,
            'additionalNights' => $additionalNights,
            'isEarlyCheckout' => $isEarlyCheckout,
            'isLateCheckout' => $isLateCheckout,
            'isNormalCheckout' => $isNormalCheckout,
            'checkoutType' => $checkoutType,
            'roomRate' => $rate,
            'roomAmount' => round($roomAmount, 2),
            'gstRate' => $gstRate,
            'roomGstAmount' => $roomGstAmount,
            'extrasAmount' => round($extrasAmount, 2),
            'extrasGstAmount' => round($extrasGstAmount, 2),
            'cgstAmount' => $taxBreakup['cgst_amount'],
            'sgstAmount' => $taxBreakup['sgst_amount'],
            'igstAmount' => $taxBreakup['igst_amount'],
            'isInterState' => $taxBreakup['is_inter_state'],
            'earlyCheckoutFee' => round($earlyCheckoutFee, 2),
            'discountAmount' => round($discountAmount, 2),
            'total' => round($total, 2),
            'advancePaid' => round($advancePaid, 2),
            'otherPayments' => round($otherPayments, 2),
            'totalSuccessfulPayments' => round($totalSuccessfulPayments, 2),
            'previouslyRefunded' => round($previouslyRefunded, 2),
            'netPaid' => round($netPaid, 2),
            'balance' => $balance,
            'outstandingBalance' => $outstandingBalance,
            'eligibleRefund' => $eligibleRefund,
            'charges' => $charges,
            'isFullyPaid' => $balance <= 0,
        ];
    }
}
