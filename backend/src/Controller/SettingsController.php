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

    public function updateWhatsapp(Request $request): array
    {
        $data = $request->all();
        $fields = [];

        if (array_key_exists('template', $data) || array_key_exists('checkout_template', $data) || array_key_exists('checkoutTemplate', $data)) {
            $checkoutTpl = (string) ($data['template'] ?? $data['checkout_template'] ?? $data['checkoutTemplate']);
            $fields['whatsapp_checkout_template'] = trim($checkoutTpl);
        }
        if (array_key_exists('checkin_template', $data) || array_key_exists('checkinTemplate', $data) || array_key_exists('whatsapp_checkin_template', $data)) {
            $val = (string) ($data['checkin_template'] ?? $data['checkinTemplate'] ?? $data['whatsapp_checkin_template']);
            $fields['whatsapp_checkin_template'] = trim($val);
        }
        if (array_key_exists('checkin_enabled', $data) || array_key_exists('checkinEnabled', $data) || array_key_exists('whatsapp_checkin_enabled', $data)) {
            $val = $data['checkin_enabled'] ?? $data['checkinEnabled'] ?? $data['whatsapp_checkin_enabled'];
            $fields['whatsapp_checkin_enabled'] = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        }
        if (isset($data['timezone']) && is_string($data['timezone']) && trim($data['timezone']) !== '') {
            $fields['timezone'] = trim($data['timezone']);
        }

        if (empty($fields)) {
            Validator::assert($data, [
                'template' => 'required|string',
            ]);
        }

        $hotelId = (int) $request->attribute('hotelId');
        $this->settings->update($hotelId, $fields);
        return $this->settings->find($hotelId);
    }

    public function updatePolicies(Request $request): array
    {
        $data = $request->all();
        $fields = [];
        if (array_key_exists('cancellationDeadlineHours', $data) || array_key_exists('cancellation_deadline_hours', $data)) {
            $fields['cancellation_deadline_hours'] = max(0, (int) ($data['cancellationDeadlineHours'] ?? $data['cancellation_deadline_hours']));
        }
        if (array_key_exists('cancellationFreeAllowed', $data) || array_key_exists('cancellation_free_allowed', $data)) {
            $val = $data['cancellationFreeAllowed'] ?? $data['cancellation_free_allowed'];
            $fields['cancellation_free_allowed'] = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        }
        if (array_key_exists('cancellationFeeType', $data) || array_key_exists('cancellation_fee_type', $data)) {
            $val = (string) ($data['cancellationFeeType'] ?? $data['cancellation_fee_type']);
            if (in_array($val, ['none', 'fixed', 'percentage', 'first_night'], true)) {
                $fields['cancellation_fee_type'] = $val;
            }
        }
        if (array_key_exists('cancellationFeeValue', $data) || array_key_exists('cancellation_fee_value', $data)) {
            $fields['cancellation_fee_value'] = max(0.0, (float) ($data['cancellationFeeValue'] ?? $data['cancellation_fee_value']));
        }
        if (array_key_exists('cancellationLateFeeType', $data) || array_key_exists('cancellation_late_fee_type', $data)) {
            $val = (string) ($data['cancellationLateFeeType'] ?? $data['cancellation_late_fee_type']);
            if (in_array($val, ['none', 'fixed', 'percentage', 'first_night'], true)) {
                $fields['cancellation_late_fee_type'] = $val;
            }
        }
        if (array_key_exists('cancellationLateFeeValue', $data) || array_key_exists('cancellation_late_fee_value', $data)) {
            $fields['cancellation_late_fee_value'] = max(0.0, (float) ($data['cancellationLateFeeValue'] ?? $data['cancellation_late_fee_value']));
        }
        if (array_key_exists('earlyCheckoutRefundUnusedNights', $data) || array_key_exists('early_checkout_refund_unused_nights', $data)) {
            $val = $data['earlyCheckoutRefundUnusedNights'] ?? $data['early_checkout_refund_unused_nights'];
            $fields['early_checkout_refund_unused_nights'] = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
        }
        if (array_key_exists('earlyCheckoutFeeType', $data) || array_key_exists('early_checkout_fee_type', $data)) {
            $val = (string) ($data['earlyCheckoutFeeType'] ?? $data['early_checkout_fee_type']);
            if (in_array($val, ['none', 'fixed', 'percentage', 'one_night'], true)) {
                $fields['early_checkout_fee_type'] = $val;
            }
        }
        if (array_key_exists('earlyCheckoutFeeValue', $data) || array_key_exists('early_checkout_fee_value', $data)) {
            $fields['early_checkout_fee_value'] = max(0.0, (float) ($data['earlyCheckoutFeeValue'] ?? $data['early_checkout_fee_value']));
        }

        $hotelId = (int) $request->attribute('hotelId');
        if (!empty($fields)) {
            $this->settings->update($hotelId, $fields);
        }
        return $this->settings->find($hotelId);
    }
}
