<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Support\ApiException;

/** Read-only aggregation for the printable invoice view — no business logic of its own. */
final class InvoiceController
{
    public function __construct(
        private readonly InvoiceRepository $invoices,
        private readonly StayRepository $stays,
        private readonly StayChargeRepository $charges,
        private readonly HotelRepository $hotels,
    ) {
    }

    public function show(Request $request): array
    {
        return $this->payload((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
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

        return [
            'invoice' => $invoice,
            'hotel' => $hotel,
            'stay' => $stay,
            'charges' => $charges,
        ];
    }
}
