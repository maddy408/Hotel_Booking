<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
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
        $this->invoices->updateGstin($id, $gstin !== '' ? $gstin : null);
        return $this->payload($id, $hotelId);
    }

    public function byStay(Request $request): array
    {
        $invoice = $this->invoices->findByStay((int) $request->routeParams['stayId']);
        if ($invoice === null) {
            throw ApiException::notFound('No invoice for this stay yet.');
        }
        return $this->payload((int) $invoice['id'], (int) $request->attribute('hotelId'));
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
