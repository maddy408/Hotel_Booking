<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\SettingsRepository;

/**
 * Hotel-room GST slab lookup, configurable per hotel (prototype hardcoded
 * <=1000 -> 0%, <=7500 -> 5%, >7500 -> 18%; those are just the seeded defaults now).
 */
final class GstService
{
    public function __construct(private readonly SettingsRepository $settings)
    {
    }

    /** @return array{rate:float, taxExtras:bool} */
    public function slabFor(int $hotelId, float $nightlyRate): array
    {
        $s = $this->settings->find($hotelId);
        if ($s === null) {
            return ['rate' => $nightlyRate <= 1000 ? 0.0 : ($nightlyRate <= 7500 ? 0.05 : 0.18), 'taxExtras' => false];
        }
        $rate = $nightlyRate <= (float) $s['gst_slab1_max_rate']
            ? (float) $s['gst_slab1_gst_rate']
            : ($nightlyRate <= (float) $s['gst_slab2_max_rate']
                ? (float) $s['gst_slab2_gst_rate']
                : (float) $s['gst_slab3_gst_rate']);
        return ['rate' => $rate, 'taxExtras' => (bool) $s['tax_extras']];
    }
}
