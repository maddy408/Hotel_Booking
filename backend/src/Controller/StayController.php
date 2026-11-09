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
        if (!isset($data['advanceAmount']) || !is_numeric($data['advanceAmount']) || (float) $data['advanceAmount'] <= 0) {
            throw \App\Support\ApiException::validation(
                ['advanceAmount' => 'Please enter and collect the advance amount before check-in.'],
                'Please enter and collect the advance amount before check-in.'
            );
        }
        Validator::assert($data, [
            'roomId' => 'required|integer|min:1',
            'phone' => 'required|phone',
            'name' => 'required|string',
            'idProofType' => 'required|in:Aadhaar,Driving Licence,Voter ID,Passport,Other',
            'idProofNumber' => 'required|string',
            'persons' => 'required|integer|min:1',
            'days' => 'required|integer|min:1',
            'rate' => 'required|numeric|min:0',
            'advanceAmount' => 'required|numeric|min:0.01',
            'advanceMethod' => 'required|in:cash,upi,card',
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
            isset($data['checkoutTime']) ? (string) $data['checkoutTime'] : null,
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

    public function updateCheckout(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'checkoutPlanned' => 'required|date',
        ]);
        return $this->stays->updateStayCheckout(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (string) $data['checkoutPlanned'],
            (string) ($data['checkoutTime'] ?? '12:00:00'),
            (int) $request->attribute('userId'),
        );
    }

    public function earlyCheckoutPreview(Request $request): array
    {
        return $this->stays->earlyCheckoutPreview(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            $request->input('checkoutDate') ?: null,
            $request->input('discount') !== null ? (float) $request->input('discount') : null,
            $request->input('earlyCheckoutFee') !== null ? (float) $request->input('earlyCheckoutFee') : null,
        );
    }

    public function applyDiscount(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'amount' => 'required|numeric|min:0',
        ]);
        return $this->stays->applyDiscount(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (float) $data['amount'],
            isset($data['reason']) ? (string) $data['reason'] : null,
            (int) $request->attribute('userId'),
        );
    }

    public function refundSummary(Request $request): array
    {
        return $this->stays->refundSummary(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId')
        );
    }

    public function processRefund(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,upi,card',
        ]);
        return $this->stays->processRefund(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (float) $data['amount'],
            (string) $data['method'],
            isset($data['reason']) ? (string) $data['reason'] : null,
            isset($data['parentPaymentId']) && $data['parentPaymentId'] !== '' ? (int) $data['parentPaymentId'] : null,
            (int) $request->attribute('userId'),
            isset($data['status']) ? (string) $data['status'] : 'successful'
        );
    }

    public function checkout(Request $request): array
    {
        $data = $request->all();
        $rules = ['paymentMethod' => 'required|in:cash,upi,card'];
        if (array_key_exists('amount', $data)) {
            $rules['amount'] = 'required|numeric|min:0';
        }
        Validator::assert($data, $rules);

        return $this->stays->checkout(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (string) $data['paymentMethod'],
            $data['guestGstin'] ?? null,
            (int) $request->attribute('userId'),
            isset($data['amount']) ? (float) $data['amount'] : null,
            isset($data['actualCheckoutDate']) ? (string) $data['actualCheckoutDate'] : null,
            isset($data['discountAmount']) ? (float) $data['discountAmount'] : (isset($data['discount']) ? (float) $data['discount'] : null),
            isset($data['discountReason']) ? (string) $data['discountReason'] : null,
            isset($data['earlyCheckoutFee']) ? (float) $data['earlyCheckoutFee'] : null,
            isset($data['refundParentPaymentId']) ? (int) $data['refundParentPaymentId'] : null,
            isset($data['refundReason']) ? (string) $data['refundReason'] : null,
        );
    }
}
