<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\SettingsRepository;

/**
 * Hotel accommodation and extra charges GST calculation service.
 * Standard Indian hotel accommodation GST slabs:
 * - Up to ₹7,500: 5% (2.5% CGST + 2.5% SGST or 5% IGST)
 * - Above ₹7,500: 18% (9% CGST + 9% SGST or 18% IGST)
 *
 * Slabs are configurable per hotel in the database and evaluated dynamically on
 * nightly tariff per room per night, regardless of room type name.
 */
final class GstService
{
    public const DEFAULT_SLAB1_THRESHOLD = 7500.00;
    public const DEFAULT_SLAB1_RATE = 0.0500;
    public const DEFAULT_SLAB2_RATE = 0.1800;

    public const CATEGORY_FOOD = 'Food';
    public const CATEGORY_LAUNDRY = 'Laundry';
    public const CATEGORY_EXTRA_BED = 'Extra bed';
    public const CATEGORY_TAXI = 'Taxi';
    public const CATEGORY_OTHER = 'Other';

    public function __construct(private readonly SettingsRepository $settings)
    {
    }

    /**
     * Determines applicable GST slab for a single room tariff per night.
     * Slabs are based on the room's applicable nightly tariff, never on room type name or stay total.
     *
     * @return array{
     *   rate: float,
     *   slab: int,
     *   threshold: float,
     *   taxExtras: bool,
     *   cgst_rate: float,
     *   sgst_rate: float,
     *   igst_rate: float
     * }
     */
    public function slabFor(int $hotelId, float $nightlyRate): array
    {
        $s = $this->settings->find($hotelId);
        if ($s === null) {
            $threshold = self::DEFAULT_SLAB1_THRESHOLD;
            $rate = $nightlyRate <= $threshold ? self::DEFAULT_SLAB1_RATE : self::DEFAULT_SLAB2_RATE;
            $slab = $nightlyRate <= $threshold ? 1 : 2;
            $taxExtras = false;
        } else {
            $s1Max = (float) ($s['gst_slab1_max_rate'] ?? self::DEFAULT_SLAB1_THRESHOLD);
            $s1Rate = (float) ($s['gst_slab1_gst_rate'] ?? self::DEFAULT_SLAB1_RATE);
            $s2Max = (float) ($s['gst_slab2_max_rate'] ?? self::DEFAULT_SLAB1_THRESHOLD);
            $s2Rate = (float) ($s['gst_slab2_gst_rate'] ?? self::DEFAULT_SLAB2_RATE);
            $s3Rate = (float) ($s['gst_slab3_gst_rate'] ?? self::DEFAULT_SLAB2_RATE);

            if ($nightlyRate <= $s1Max) {
                $rate = $s1Rate;
                $slab = 1;
                $threshold = $s1Max;
            } elseif ($nightlyRate <= $s2Max) {
                $rate = $s2Rate;
                $slab = 2;
                $threshold = $s2Max;
            } else {
                $rate = $s3Rate;
                $slab = 3;
                $threshold = $s2Max;
            }
            $taxExtras = (bool) ($s['tax_extras'] ?? false);
        }

        $halfRate = round($rate / 2, 4);

        return [
            'rate' => $rate,
            'slab' => $slab,
            'threshold' => $threshold,
            'taxExtras' => $taxExtras,
            'cgst_rate' => $halfRate,
            'sgst_rate' => round($rate - $halfRate, 4),
            'igst_rate' => $rate,
        ];
    }

    /**
     * Calculates accommodation GST for one or multiple nights.
     * Evaluates each night's tariff separately (does not use total booking amount divided/multiplied).
     *
     * @param float|array<int,float> $tariffs Single nightly rate or array of rates per night
     * @param int $nights Number of nights (used if $tariffs is a float)
     * @return array{
     *   room_amount: float,
     *   gst_rate: float,
     *   tax_amount: float,
     *   total_amount: float,
     *   nights_breakdown: array<int,array{night:int, tariff:float, gst_rate:float, tax_amount:float, total:float}>
     * }
     */
    public function calculateAccommodation(int $hotelId, float|array $tariffs, int $nights = 1): array
    {
        $nights = max(1, $nights);
        $nightlyList = is_array($tariffs) ? array_values($tariffs) : array_fill(0, $nights, (float) $tariffs);
        if ($nightlyList === []) {
            $nightlyList = [0.0];
        }

        $totalRoomAmount = 0.0;
        $totalTaxAmount = 0.0;
        $breakdown = [];

        foreach ($nightlyList as $idx => $tariff) {
            $tariffFloat = max(0.0, (float) $tariff);
            $slab = $this->slabFor($hotelId, $tariffFloat);
            $nightTax = round($tariffFloat * $slab['rate'], 2);
            $totalRoomAmount += $tariffFloat;
            $totalTaxAmount += $nightTax;

            $breakdown[] = [
                'night' => $idx + 1,
                'tariff' => $tariffFloat,
                'gst_rate' => $slab['rate'],
                'tax_amount' => $nightTax,
                'total' => round($tariffFloat + $nightTax, 2),
            ];
        }

        $effectiveGstRate = $totalRoomAmount > 0
            ? round($totalTaxAmount / $totalRoomAmount, 4)
            : ($breakdown[0]['gst_rate'] ?? self::DEFAULT_SLAB1_RATE);

        return [
            'room_amount' => round($totalRoomAmount, 2),
            'gst_rate' => $effectiveGstRate,
            'tax_amount' => round($totalTaxAmount, 2),
            'total_amount' => round($totalRoomAmount + $totalTaxAmount, 2),
            'nights_breakdown' => $breakdown,
        ];
    }

    /**
     * Calculates GST and tax classification for extra stay charges.
     * Uses category SAC and individual configured rates; does not automatically apply room GST rate.
     *
     * @return array{
     *   category: string,
     *   sac_code: string,
     *   is_taxable: bool,
     *   gst_rate: float,
     *   gst_amount: float
     * }
     */
    public function taxForExtraCharge(int $hotelId, string $label, float $amount, ?bool $isTaxable = null): array
    {
        $amount = max(0.0, $amount);
        $cleanLabel = trim($label);
        $s = $this->settings->find($hotelId) ?? [];
        $taxExtrasGlobal = !empty($s['tax_extras']);

        // Classify category and SAC code based on label
        $lower = strtolower($cleanLabel);
        if (str_contains($lower, 'food') || str_contains($lower, 'dinner') || str_contains($lower, 'breakfast') || str_contains($lower, 'lunch') || str_contains($lower, 'restaurant') || str_contains($lower, 'meal')) {
            $category = self::CATEGORY_FOOD;
            $sac = '996331';
            $rate = (float) ($s['extra_food_gst_rate'] ?? 0.0500);
            $defaultTaxable = true;
        } elseif (str_contains($lower, 'laundry') || str_contains($lower, 'wash') || str_contains($lower, 'dry clean') || str_contains($lower, 'iron')) {
            $category = self::CATEGORY_LAUNDRY;
            $sac = '999719';
            $rate = (float) ($s['extra_laundry_gst_rate'] ?? 0.1800);
            $defaultTaxable = true;
        } elseif (str_contains($lower, 'extra bed') || str_contains($lower, 'bed') || str_contains($lower, 'mattress') || str_contains($lower, 'cot')) {
            $category = self::CATEGORY_EXTRA_BED;
            $sac = '996311';
            $rate = (float) ($s['extra_bed_gst_rate'] ?? 0.0500);
            $defaultTaxable = true;
        } elseif (str_contains($lower, 'taxi') || str_contains($lower, 'cab') || str_contains($lower, 'transport') || str_contains($lower, 'car') || str_contains($lower, 'pickup') || str_contains($lower, 'drop')) {
            $category = self::CATEGORY_TAXI;
            $sac = '996412';
            $rate = (float) ($s['extra_taxi_gst_rate'] ?? 0.0500);
            $defaultTaxable = true;
        } else {
            $category = self::CATEGORY_OTHER;
            $sac = '9997';
            $rate = (float) ($s['extra_other_gst_rate'] ?? 0.1800);
            $defaultTaxable = $taxExtrasGlobal;
        }

        $taxable = $isTaxable !== null ? $isTaxable : ($taxExtrasGlobal || $defaultTaxable);
        $taxAmount = $taxable ? round($amount * $rate, 2) : 0.00;

        return [
            'category' => $category,
            'sac_code' => $sac,
            'is_taxable' => $taxable,
            'gst_rate' => $taxable ? $rate : 0.0,
            'gst_amount' => $taxAmount,
        ];
    }

    /**
     * Splits total GST into CGST/SGST (intra-state) or IGST (inter-state).
     *
     * @return array{
     *   is_inter_state: bool,
     *   hotel_state_code: string,
     *   guest_state_code: ?string,
     *   cgst_amount: float,
     *   sgst_amount: float,
     *   igst_amount: float
     * }
     */
    public function calculateTaxBreakup(float $totalTax, ?string $hotelGstin, ?string $guestGstin, ?string $hotelPlace = 'Tenkasi'): array
    {
        $totalTax = max(0.0, round($totalTax, 2));
        $hotelState = self::extractStateCode($hotelGstin) ?? '33'; // Default to Tamil Nadu ('33')
        $guestState = self::extractStateCode($guestGstin);

        $isInterState = ($guestState !== null && $guestState !== '' && $guestState !== $hotelState);

        if ($isInterState) {
            return [
                'is_inter_state' => true,
                'hotel_state_code' => $hotelState,
                'guest_state_code' => $guestState,
                'cgst_amount' => 0.00,
                'sgst_amount' => 0.00,
                'igst_amount' => $totalTax,
            ];
        }

        $half = round($totalTax / 2, 2);
        return [
            'is_inter_state' => false,
            'hotel_state_code' => $hotelState,
            'guest_state_code' => $guestState,
            'cgst_amount' => $half,
            'sgst_amount' => round($totalTax - $half, 2),
            'igst_amount' => 0.00,
        ];
    }

    /** Extracts the 2-digit Indian state code from a 15-character GSTIN. */
    public static function extractStateCode(?string $gstin): ?string
    {
        if ($gstin === null) {
            return null;
        }
        $trimmed = strtoupper(trim($gstin));
        if (preg_match('/^([0-9]{2})[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/', $trimmed, $m)) {
            return $m[1];
        }
        if (preg_match('/^([0-9]{2})/', $trimmed, $m)) {
            return $m[1];
        }
        return null;
    }
}
