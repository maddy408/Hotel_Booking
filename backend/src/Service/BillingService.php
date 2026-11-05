<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\PaymentRepository;
use App\Repository\StayChargeRepository;

/**
 * Mirrors the prototype's bill(): nights x rate + GST(rate) + extras (taxed only if
 * settings.tax_extras is on) - advance already paid = balance. At least 1 night always.
 */
final class BillingService
{
    public function __construct(
        private readonly GstService $gst,
        private readonly StayChargeRepository $charges,
        private readonly PaymentRepository $payments,
    ) {
    }

    public static function nightsBetween(string $checkIn, string $referenceDate): int
    {
        $a = new \DateTimeImmutable($checkIn);
        $b = new \DateTimeImmutable($referenceDate);
        $diff = (int) round(($b->getTimestamp() - $a->getTimestamp()) / 86400);
        return max(1, $diff);
    }

    /** @return array{nights:int, roomAmount:float, gstRate:float, roomGstAmount:float, extrasAmount:float, extrasGstAmount:float, total:float, advancePaid:float, balance:float, charges:array} */
    public function computeBill(array $stay, ?string $asOfDate = null): array
    {
        $hotelId = (int) $stay['hotel_id'];
        $rate = (float) $stay['rate'];
        $referenceDate = $stay['checkout_actual'] ?? $asOfDate ?? date('Y-m-d');

        $nights = self::nightsBetween($stay['check_in_date'], $referenceDate);
        $roomAmount = $nights * $rate;

        $slab = $this->gst->slabFor($hotelId, $rate);
        $gstRate = $slab['rate'];
        $roomGstAmount = round($roomAmount * $gstRate, 2);

        $charges = $this->charges->forStay((int) $stay['id']);
        $extrasAmount = 0.0;
        $extrasGstAmount = 0.0;
        foreach ($charges as $charge) {
            $extrasAmount += (float) $charge['amount'];
            if ($slab['taxExtras'] && (bool) $charge['is_taxable']) {
                $extrasGstAmount += round((float) $charge['amount'] * $gstRate, 2);
            }
        }

        $total = $roomAmount + $roomGstAmount + $extrasAmount + $extrasGstAmount;
        $advancePaid = $this->payments->netSettledForStay((int) $stay['id'], $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null);
        $balance = round($total - $advancePaid, 2);

        return [
            'nights' => $nights,
            'roomAmount' => round($roomAmount, 2),
            'gstRate' => $gstRate,
            'roomGstAmount' => $roomGstAmount,
            'extrasAmount' => round($extrasAmount, 2),
            'extrasGstAmount' => round($extrasGstAmount, 2),
            'total' => round($total, 2),
            'advancePaid' => round($advancePaid, 2),
            'balance' => $balance,
            'charges' => $charges,
        ];
    }
}
