<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\Validator;

final class ReservationController
{
    public function __construct(
        private readonly ReservationService $reservations,
        private readonly StayService $stays,
    ) {
    }

    public function index(Request $request): array
    {
        return $this->reservations->list((int) $request->attribute('hotelId'));
    }

    public function show(Request $request): array
    {
        return $this->reservations->find((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
    }

    public function freeRooms(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'checkIn' => 'required|date',
            'checkOut' => 'required|date',
        ]);
        return $this->reservations->freeRooms(
            (int) $request->attribute('hotelId'),
            (string) $data['checkIn'],
            (string) $data['checkOut'],
            isset($data['roomTypeId']) && $data['roomTypeId'] !== '' ? (int) $data['roomTypeId'] : null,
            isset($data['excludeReservationId']) ? (int) $data['excludeReservationId'] : null,
        );
    }

    public function create(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'roomId' => 'required|integer|min:1',
            'phone' => 'required|phone',
            'name' => 'required|string',
            'checkIn' => 'required|date',
            'checkOut' => 'required|date',
            'persons' => 'required|integer|min:1',
            'rate' => 'required|numeric|min:0',
            'advanceAmount' => 'numeric|min:0',
            'advanceMethod' => 'in:cash,upi,card',
        ]);
        return $this->reservations->create(
            (int) $request->attribute('hotelId'),
            (int) $data['roomId'],
            (string) $data['phone'],
            trim((string) $data['name']),
            (string) $data['checkIn'],
            (string) $data['checkOut'],
            (int) $data['persons'],
            (float) $data['rate'],
            (float) ($data['advanceAmount'] ?? 0),
            (string) ($data['advanceMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
        );
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'roomId' => 'required|integer|min:1',
            'checkIn' => 'required|date',
            'checkOut' => 'required|date',
            'persons' => 'required|integer|min:1',
            'rate' => 'required|numeric|min:0',
            'advanceAmount' => 'numeric|min:0',
            'advanceMethod' => 'in:cash,upi,card',
        ]);
        return $this->reservations->update(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $data['roomId'],
            (string) $data['checkIn'],
            (string) $data['checkOut'],
            (int) $data['persons'],
            (float) $data['rate'],
            (float) ($data['advanceAmount'] ?? 0),
            (string) ($data['advanceMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
        );
    }

    public function cancel(Request $request): array
    {
        $data = $request->all();
        return $this->reservations->cancel(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            $data['reason'] ?? null,
            (float) ($data['refundAmount'] ?? 0),
            (string) ($data['refundMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
        );
    }

    public function noShow(Request $request): array
    {
        return $this->reservations->markNoShow(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
    }

    public function checkIn(Request $request): array
    {
        return $this->stays->checkInFromReservation(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
    }
}
