<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\StayService;
use App\Support\Validator;

final class StayController
{
    public function __construct(private readonly StayService $stays)
    {
    }

    public function index(Request $request): array
    {
        return $this->stays->listDone(
            (int) $request->attribute('hotelId'),
            $request->input('from') ?: null,
            $request->input('to') ?: null,
        );
    }

    public function show(Request $request): array
    {
        return $this->stays->find((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
    }

    public function bill(Request $request): array
    {
        return $this->stays->bill((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
    }

    public function directCheckIn(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'roomId' => 'required|integer|min:1',
            'phone' => 'required|phone',
            'name' => 'required|string',
            'idProofType' => 'required|in:Aadhaar,Driving Licence,Voter ID,Passport,Other',
            'idProofNumber' => 'required|string',
            'persons' => 'required|integer|min:1',
            'days' => 'required|integer|min:1',
            'rate' => 'required|numeric|min:0',
            'advanceAmount' => 'numeric|min:0',
            'advanceMethod' => 'in:cash,upi,card',
        ]);
        return $this->stays->directCheckIn(
            (int) $request->attribute('hotelId'),
            (int) $data['roomId'],
            (string) $data['phone'],
            trim((string) $data['name']),
            (string) $data['idProofType'],
            (string) $data['idProofNumber'],
            isset($data['city']) ? trim((string) $data['city']) : null,
            (int) $data['persons'],
            (int) $data['days'],
            (float) $data['rate'],
            (float) ($data['advanceAmount'] ?? 0),
            (string) ($data['advanceMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
        );
    }

    public function addExtra(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'label' => 'required|string',
            'amount' => 'required|numeric|min:1',
        ]);
        return $this->stays->addExtra(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (string) $data['label'],
            (float) $data['amount'],
            (bool) ($data['isTaxable'] ?? false),
            (int) $request->attribute('userId'),
        );
    }

    public function removeExtra(Request $request): array
    {
        return $this->stays->removeExtra(
            (int) $request->routeParams['id'],
            (int) $request->routeParams['chargeId'],
            (int) $request->attribute('hotelId'),
        );
    }

    public function extend(Request $request): array
    {
        return $this->stays->extend(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
    }

    public function checkout(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['paymentMethod' => 'required|in:cash,upi,card']);
        return $this->stays->checkout(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (string) $data['paymentMethod'],
            $data['guestGstin'] ?? null,
            (int) $request->attribute('userId'),
        );
    }
}
