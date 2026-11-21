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

    private function parseStayId(Request $request): int
    {
        $idParam = (string) ($request->routeParams['id'] ?? '');
        if (str_starts_with($idParam, 'stay-')) {
            return (int) substr($idParam, 5);
        }
        return (int) $idParam;
    }

    public function show(Request $request): array
    {
        return $this->stays->find($this->parseStayId($request), (int) $request->attribute('hotelId'));
    }

    public function bill(Request $request): array
    {
        return $this->stays->bill($this->parseStayId($request), (int) $request->attribute('hotelId'));
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
        $hotelId = (int) $request->attribute('hotelId');
        $phone = isset($data['phone']) ? preg_replace('/\D/', '', (string) $data['phone']) : '';
        $existingGuest = $phone !== '' ? $this->stays->getGuestService()->findByPhone($hotelId, $phone) : null;
        $isExisting = $existingGuest !== null;

        Validator::assert($data, [
            'roomId' => 'required|integer|min:1',
            'phone' => 'required|phone',
            'name' => 'required|string',
            'idProofType' => 'required|in:Aadhaar,Driving Licence,Voter ID,Passport,Other',
            'idProofNumber' => $isExisting ? 'string' : 'required|string',
            'persons' => 'required|integer|min:1',
            'days' => 'required|integer|min:1',
            'rate' => 'required|numeric|min:0',
            'advanceAmount' => 'required|numeric|min:0.01',
            'advanceMethod' => 'required|in:cash,upi,card',
        ]);

        $filesInput = $request->file('documents') ?? $request->file('documents[]') ?? $request->file('files') ?? $request->file('files[]') ?? $_FILES['documents'] ?? $_FILES['documents[]'] ?? $_FILES['files'] ?? $_FILES['files[]'] ?? null;
        $documentFiles = \App\Support\OccupantDocumentUploader::normalizeFiles($filesInput);

        $occupantTargets = $request->input('occupantTargets') ?? $request->input('occupantTargets[]') ?? $_POST['occupantTargets'] ?? $_POST['occupantTargets[]'] ?? [];
        if (is_string($occupantTargets)) {
            $decoded = json_decode($occupantTargets, true);
            $occupantTargets = is_array($decoded) ? $decoded : [];
        }

        $occupants = $request->input('occupants') ?? $request->input('occupants[]') ?? $_POST['occupants'] ?? $_POST['occupants[]'] ?? [];
        if (is_string($occupants)) {
            $decoded = json_decode($occupants, true);
            $occupants = is_array($decoded) ? $decoded : [];
        }

        $verifyDocuments = filter_var($request->input('verifyDocuments') ?? false, FILTER_VALIDATE_BOOLEAN);

        return $this->stays->directCheckIn(
            $hotelId,
            (int) $data['roomId'],
            (string) $data['phone'],
            trim((string) $data['name']),
            (string) $data['idProofType'],
            isset($data['idProofNumber']) ? (string) $data['idProofNumber'] : '',
            isset($data['city']) ? trim((string) $data['city']) : null,
            (int) $data['persons'],
            (int) $data['days'],
            (float) $data['rate'],
            (float) ($data['advanceAmount'] ?? 0),
            (string) ($data['advanceMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
            isset($data['checkoutTime']) ? (string) $data['checkoutTime'] : null,
            isset($data['bookingSource']) || isset($data['booking_source']) ? (string) ($data['bookingSource'] ?? $data['booking_source']) : 'Social Media',
            isset($data['referredByGuestId']) && $data['referredByGuestId'] !== '' ? (int) $data['referredByGuestId'] : (isset($data['referred_by_guest_id']) && $data['referred_by_guest_id'] !== '' ? (int) $data['referred_by_guest_id'] : null),
            isset($data['otherSource']) ? (string) $data['otherSource'] : (isset($data['other_source']) ? (string) $data['other_source'] : null),
            $documentFiles,
            (array) $occupantTargets,
            (array) $occupants,
            $verifyDocuments,
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
            $this->parseStayId($request),
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
            $this->parseStayId($request),
            (int) $request->routeParams['chargeId'],
            (int) $request->attribute('hotelId'),
        );
    }

    public function extend(Request $request): array
    {
        return $this->stays->extend(
            $this->parseStayId($request),
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
            $this->parseStayId($request),
            (int) $request->attribute('hotelId'),
            (string) $data['checkoutPlanned'],
            (string) ($data['checkoutTime'] ?? '12:00:00'),
            (int) $request->attribute('userId'),
        );
    }

    public function earlyCheckoutPreview(Request $request): array
    {
        $checkoutDate = $request->input('checkoutDate') ?: null;
        if ($checkoutDate !== null) {
            Validator::assert(['checkoutDate' => $checkoutDate], [
                'checkoutDate' => 'required|date',
            ]);
        }

        return $this->stays->earlyCheckoutPreview(
            $this->parseStayId($request),
            (int) $request->attribute('hotelId'),
            $checkoutDate,
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
            $this->parseStayId($request),
            (int) $request->attribute('hotelId'),
            (float) $data['amount'],
            isset($data['reason']) ? (string) $data['reason'] : null,
            (int) $request->attribute('userId'),
        );
    }

    public function refundSummary(Request $request): array
    {
        return $this->stays->refundSummary(
            $this->parseStayId($request),
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
            $this->parseStayId($request),
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
        if (!empty($data['actualCheckoutDate'])) {
            $rules['actualCheckoutDate'] = 'required|date';
        }
        if (!empty($data['checkoutType'])) {
            $rules['checkoutType'] = 'in:early,late,normal,extended';
        }
        Validator::assert($data, $rules);

        return $this->stays->checkout(
            $this->parseStayId($request),
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
            isset($data['checkoutType']) ? (string) $data['checkoutType'] : null,
        );
    }
}
