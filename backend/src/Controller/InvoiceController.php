<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\BillingService;
use App\Support\ApiException;

/** Read-only aggregation for the printable invoice view with editable guest GSTIN. */
final class InvoiceController
{
    public function __construct(
        private readonly InvoiceRepository $invoices,
        private readonly StayRepository $stays,
        private readonly StayChargeRepository $charges,
        private readonly HotelRepository $hotels,
        private readonly PaymentRepository $payments,
        private readonly ?BillingService $billing = null,
        private readonly ?SettingsRepository $settings = null,
    ) {
    }

    public function show(Request $request): array
    {
        return $this->payload((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
    }

    public function update(Request $request): array
    {
        $id = (int) $request->routeParams['id'];
        $hotelId = (int) $request->attribute('hotelId');
        $invoice = $this->invoices->find($id);
        if ($invoice === null || (int) $invoice['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Invoice not found.');
        }
        $data = $request->all();
        $gstin = isset($data['guestGstin']) ? trim((string) $data['guestGstin']) : null;
        $cleanGstin = $gstin !== '' ? $gstin : null;

        $totalTax = (float) $invoice['room_gst_amount'] + (float) $invoice['extras_gst_amount'];
        $hotel = $this->hotels->find($hotelId);
        $hotelState = \App\Service\GstService::extractStateCode($hotel['gstin'] ?? '') ?? '33';
        $guestState = \App\Service\GstService::extractStateCode($cleanGstin);
        $isInterState = ($guestState !== null && $guestState !== '' && $guestState !== $hotelState);

        if ($isInterState) {
            $cgst = 0.00;
            $sgst = 0.00;
            $igst = $totalTax;
        } else {
            $cgst = round($totalTax / 2, 2);
            $sgst = round($totalTax - $cgst, 2);
            $igst = 0.00;
        }

        $this->invoices->updateGstin($id, $cleanGstin, $cgst, $sgst, $igst);
        return $this->payload($id, $hotelId);
    }

    public function byStay(Request $request): array
    {
        $stayId = (int) $request->routeParams['stayId'];
        $hotelId = (int) $request->attribute('hotelId');

        $invoice = $this->invoices->findByStay($stayId);
        if ($invoice !== null) {
            return $this->payload((int) $invoice['id'], $hotelId);
        }

        $stay = $this->stays->findWithDetails($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('No invoice for this stay yet.');
        }

        return $this->previewPayload($stay, $hotelId);
    }

    private function previewPayload(array $stay, int $hotelId): array
    {
        $hotel = $this->hotels->find($hotelId);
        $charges = $this->charges->forStay((int) $stay['id']);

        $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;
        $allPayments = $this->payments->forStayWithReservation((int) $stay['id'], $reservationId);

        $successfulPayments = array_values(array_filter($allPayments, fn ($p) => ($p['status'] ?? 'successful') === 'successful'));
        $advancePayments = array_values(array_filter($successfulPayments, fn ($p) => $p['type'] === 'advance'));
        $balancePayments = array_values(array_filter($successfulPayments, fn ($p) => $p['type'] === 'balance'));

        $advancePaid = round((float) array_sum(array_column($advancePayments, 'amount')), 2);
        $checkoutPaid = round((float) array_sum(array_column($balancePayments, 'amount')), 2);

        $totalPaid = 0.0;
        foreach ($successfulPayments as $p) {
            $amt = (float) $p['amount'];
            if ($p['type'] === 'refund') {
                $totalPaid -= $amt;
            } else {
                $totalPaid += $amt;
            }
        }
        $totalPaid = round($totalPaid, 2);

        if ($this->billing !== null) {
            $asOfDate = $stay['checkout_actual'] ?? $stay['checkout_planned'] ?? date('Y-m-d');
            $bill = $this->billing->computeBill($stay, $asOfDate);
            $roomAmount = (float) $bill['roomAmount'];
            $gstRate = (float) $bill['gstRate'];
            $roomGstAmount = (float) $bill['roomGstAmount'];
            $extrasAmount = (float) $bill['extrasAmount'];
            $extrasGstAmount = (float) $bill['extrasGstAmount'];
            $cgstAmount = (float) $bill['cgstAmount'];
            $sgstAmount = (float) $bill['sgstAmount'];
            $igstAmount = (float) $bill['igstAmount'];
            $totalAmount = (float) $bill['total'];
            $discountAmount = (float) ($bill['discountAmount'] ?? 0.0);
            $earlyCheckoutFee = (float) ($bill['earlyCheckoutFee'] ?? 0.0);
        } else {
            $checkIn = $stay['check_in_date'];
            $checkoutDate = $stay['checkout_actual'] ?? $stay['checkout_planned'] ?? date('Y-m-d');
            $nights = BillingService::nightsBetween($checkIn, $checkoutDate);
            $rate = (float) ($stay['rate'] ?? 0.0);
            $roomAmount = round($nights * $rate, 2);
            $gstRate = (float) ($stay['gst_rate'] ?? 0.05);
            $roomGstAmount = round($roomAmount * $gstRate, 2);

            $extrasAmount = 0.0;
            $extrasGstAmount = 0.0;
            foreach ($charges as $c) {
                $extrasAmount += (float) ($c['amount'] ?? 0.0);
                if (!empty($c['is_taxable']) || (float) ($c['gst_rate'] ?? 0.0) > 0) {
                    $cGstRate = (float) ($c['gst_rate'] ?? $gstRate);
                    $extrasGstAmount += round((float) ($c['amount'] ?? 0.0) * $cGstRate, 2);
                }
            }
            $extrasAmount = round($extrasAmount, 2);
            $extrasGstAmount = round($extrasGstAmount, 2);
            $totalTax = round($roomGstAmount + $extrasGstAmount, 2);

            $hotelState = \App\Service\GstService::extractStateCode($hotel['gstin'] ?? '') ?? '33';
            $guestState = \App\Service\GstService::extractStateCode($stay['guest_gstin'] ?? null);
            $isInterState = ($guestState !== null && $guestState !== '' && $guestState !== $hotelState);

            if ($isInterState) {
                $cgstAmount = 0.00;
                $sgstAmount = 0.00;
                $igstAmount = $totalTax;
            } else {
                $cgstAmount = round($totalTax / 2, 2);
                $sgstAmount = round($totalTax - $cgstAmount, 2);
                $igstAmount = 0.00;
            }

            $discountAmount = (float) ($stay['discount_amount'] ?? 0.0);
            $earlyCheckoutFee = (float) ($stay['early_checkout_fee'] ?? 0.0);
            $totalAmount = max(0.0, round($roomAmount + $roomGstAmount + $extrasAmount + $extrasGstAmount + $earlyCheckoutFee - $discountAmount, 2));
        }

        $balance = max(0.0, round($totalAmount - $totalPaid, 2));

        $d = new \DateTimeImmutable();
        $year = (int) $d->format('Y');
        $month = (int) $d->format('n');
        $settings = $this->settings !== null ? $this->settings->find($hotelId) : null;
        $fyStartMonth = (int) ($settings['financial_year_start_month'] ?? 4);
        $fyStartYear = $month >= $fyStartMonth ? $year : $year - 1;
        $fy = $fyStartYear . '-' . substr((string) ($fyStartYear + 1), -2);

        $prefix = (string) ($settings['invoice_prefix'] ?? 'INV');
        $invoiceNumber = sprintf('%s-PROFORMA-%04d', $prefix, (int) $stay['id']);

        $proformaInvoice = [
            'id' => 0,
            'hotel_id' => $hotelId,
            'stay_id' => (int) $stay['id'],
            'invoice_number' => $invoiceNumber,
            'financial_year' => $fy,
            'sequence_no' => 0,
            'guest_gstin' => $stay['guest_gstin'] ?? null,
            'room_amount' => $roomAmount,
            'gst_rate' => $gstRate,
            'room_gst_amount' => $roomGstAmount,
            'extras_amount' => $extrasAmount,
            'extras_gst_amount' => $extrasGstAmount,
            'cgst_amount' => $cgstAmount,
            'sgst_amount' => $sgstAmount,
            'igst_amount' => $igstAmount,
            'total_amount' => $totalAmount,
            'advance_paid' => $advancePaid,
            'balance_amount' => $balance,
            'discount_amount' => $discountAmount,
            'early_checkout_fee' => $earlyCheckoutFee,
            'refund_amount' => 0.0,
            'created_at' => date('Y-m-d H:i:s'),
            'is_proforma' => true,
        ];

        return [
            'invoice' => $proformaInvoice,
            'hotel' => $hotel,
            'stay' => $stay,
            'charges' => $charges,
            'payments' => $successfulPayments,
            'paymentSummary' => [
                'advancePaid' => $advancePaid,
                'checkoutPaid' => $checkoutPaid,
                'totalPaid' => $totalPaid,
                'balance' => $balance,
            ],
        ];
    }

    private function payload(int $id, int $hotelId): array
    {
        $invoice = $this->invoices->find($id);
        if ($invoice === null || (int) $invoice['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Invoice not found.');
        }
        $stay = $this->stays->findWithDetails((int) $invoice['stay_id']);
        $hotel = $this->hotels->find((int) $invoice['hotel_id']);
        $charges = $this->charges->forStay((int) $invoice['stay_id']);

        $reservationId = $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null;
        $allPayments = $this->payments->forStayWithReservation((int) $invoice['stay_id'], $reservationId);

        $successfulPayments = array_values(array_filter($allPayments, fn ($p) => ($p['status'] ?? 'successful') === 'successful'));
        $advancePayments = array_values(array_filter($successfulPayments, fn ($p) => $p['type'] === 'advance'));
        $balancePayments = array_values(array_filter($successfulPayments, fn ($p) => $p['type'] === 'balance'));

        $advancePaid = round((float) array_sum(array_column($advancePayments, 'amount')), 2);
        $checkoutPaid = round((float) array_sum(array_column($balancePayments, 'amount')), 2);

        $totalPaid = 0.0;
        foreach ($successfulPayments as $p) {
            $amt = (float) $p['amount'];
            if ($p['type'] === 'refund') {
                $totalPaid -= $amt;
            } else {
                $totalPaid += $amt;
            }
        }
        $totalPaid = round($totalPaid, 2);
        $balance = max(0.0, round((float) $invoice['total_amount'] - $totalPaid, 2));

        return [
            'invoice' => $invoice,
            'hotel' => $hotel,
            'stay' => $stay,
            'charges' => $charges,
            'payments' => $successfulPayments,
            'paymentSummary' => [
                'advancePaid' => $advancePaid,
                'checkoutPaid' => $checkoutPaid,
                'totalPaid' => $totalPaid,
                'balance' => $balance,
            ],
        ];
    }
}
