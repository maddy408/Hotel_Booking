<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\HotelRepository;
use App\Repository\SettingsRepository;
use App\Router\Request;
use App\Support\ApiException;
use App\Support\Validator;

final class SettingsController
{
    public function __construct(
        private readonly HotelRepository $hotels,
        private readonly SettingsRepository $settings,
    ) {
    }

    public function show(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $hotel = $this->hotels->find($hotelId);
        if ($hotel === null) {
            throw ApiException::notFound('Hotel not found.');
        }
        return ['hotel' => $hotel, 'settings' => $this->settings->find($hotelId)];
    }

    public function updateHotel(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['name' => 'required|string|max:150']);
        $hotelId = (int) $request->attribute('hotelId');
        $this->hotels->update(
            $hotelId,
            trim((string) $data['name']),
            isset($data['place']) ? trim((string) $data['place']) : null,
            isset($data['address']) ? trim((string) $data['address']) : null,
            isset($data['gstin']) ? trim((string) $data['gstin']) : null,
            isset($data['phone']) ? trim((string) $data['phone']) : null,
            isset($data['email']) ? trim((string) $data['email']) : null,
        );
        return $this->hotels->find($hotelId);
    }

    public function updateGst(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'gstSlab1MaxRate' => 'required|numeric|min:0',
            'gstSlab1GstRate' => 'required|numeric|min:0',
            'gstSlab2MaxRate' => 'required|numeric|min:0',
            'gstSlab2GstRate' => 'required|numeric|min:0',
            'gstSlab3GstRate' => 'required|numeric|min:0',
            'taxExtras' => 'required',
            'checkoutHour' => 'required|integer|min:0|max:23',
        ]);
        $hotelId = (int) $request->attribute('hotelId');
        $this->settings->update($hotelId, [
            'gst_slab1_max_rate' => $data['gstSlab1MaxRate'],
            'gst_slab1_gst_rate' => $data['gstSlab1GstRate'],
            'gst_slab2_max_rate' => $data['gstSlab2MaxRate'],
            'gst_slab2_gst_rate' => $data['gstSlab2GstRate'],
            'gst_slab3_gst_rate' => $data['gstSlab3GstRate'],
            'tax_extras' => $data['taxExtras'] ? 1 : 0,
            'checkout_hour' => $data['checkoutHour'],
        ]);
        return $this->settings->find($hotelId);
    }
}
