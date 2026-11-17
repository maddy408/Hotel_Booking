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
        if ((string) $data['checkOut'] <= (string) $data['checkIn']) {
            throw \App\Support\ApiException::validation(['checkOut' => 'Checkout date must be after check-in date.']);
        }
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
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            throw \App\Support\ApiException::validation(['name' => 'Guest name cannot be empty.']);
        }

        $filesInput = $request->file('documents') ?? $request->file('files') ?? $_FILES['documents'] ?? $_FILES['files'] ?? null;
        $documentFiles = \App\Support\OccupantDocumentUploader::normalizeFiles($filesInput);

        return $this->reservations->create(
            (int) $request->attribute('hotelId'),
            (int) $data['roomId'],
            (string) $data['phone'],
            $name,
            (string) $data['checkIn'],
            (string) $data['checkOut'],
            (int) $data['persons'],
            (float) $data['rate'],
            (float) ($data['advanceAmount'] ?? 0),
            (string) ($data['advanceMethod'] ?? 'cash'),
            (int) $request->attribute('userId'),
            isset($data['checkOutTime']) ? (string) $data['checkOutTime'] : null,
            isset($data['notes']) ? trim((string) $data['notes']) : null,
            isset($data['bookingSource']) || isset($data['booking_source']) ? (string) ($data['bookingSource'] ?? $data['booking_source']) : 'Social Media',
            isset($data['referredByGuestId']) && $data['referredByGuestId'] !== '' ? (int) $data['referredByGuestId'] : (isset($data['referred_by_guest_id']) && $data['referred_by_guest_id'] !== '' ? (int) $data['referred_by_guest_id'] : null),
            isset($data['otherSource']) ? (string) $data['otherSource'] : (isset($data['other_source']) ? (string) $data['other_source'] : null),
            $documentFiles,
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
            'phone' => 'phone',
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
            isset($data['checkOutTime']) ? (string) $data['checkOutTime'] : null,
            isset($data['name']) ? (string) $data['name'] : (isset($data['guestName']) ? (string) $data['guestName'] : null),
            isset($data['phone']) ? (string) $data['phone'] : null,
            isset($data['notes']) ? trim((string) $data['notes']) : null,
            isset($data['guestId']) && $data['guestId'] !== '' ? (int) $data['guestId'] : null,
            isset($data['bookingSource']) || isset($data['booking_source']) ? (string) ($data['bookingSource'] ?? $data['booking_source']) : null,
            isset($data['referredByGuestId']) && $data['referredByGuestId'] !== '' ? (int) $data['referredByGuestId'] : (isset($data['referred_by_guest_id']) && $data['referred_by_guest_id'] !== '' ? (int) $data['referred_by_guest_id'] : null),
            isset($data['otherSource']) ? (string) $data['otherSource'] : (isset($data['other_source']) ? (string) $data['other_source'] : null),
        );
    }

    public function recordAdvancePayment(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'amount' => 'required|numeric|min:0.01',
            'method' => 'required|in:cash,upi,card',
        ]);
        return $this->reservations->recordAdvancePayment(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (float) $data['amount'],
            (string) $data['method'],
            (int) $request->attribute('userId'),
        );
    }

    public function cancellationPreview(Request $request): array
    {
        return $this->reservations->cancellationPreview(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId')
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
            isset($data['cancellationFee']) ? (float) $data['cancellationFee'] : null,
            filter_var($data['processRefund'] ?? false, FILTER_VALIDATE_BOOLEAN),
            isset($data['parentPaymentId']) ? (int) $data['parentPaymentId'] : null
        );
    }

    public function refundSummary(Request $request): array
    {
        return $this->reservations->refundSummary(
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
        return $this->reservations->processRefund(
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
        $persons = $request->input('persons');
        $personsVal = ($persons !== null && is_numeric($persons)) ? (int) $persons : null;

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

        $preBookingDocAssignments = $request->input('preBookingDocAssignments') ?? $request->input('preBookingDocAssignments[]') ?? $_POST['preBookingDocAssignments'] ?? $_POST['preBookingDocAssignments[]'] ?? [];
        if (is_string($preBookingDocAssignments)) {
            $decoded = json_decode($preBookingDocAssignments, true);
            $preBookingDocAssignments = is_array($decoded) ? $decoded : [];
        }

        $verifyDocuments = filter_var($request->input('verifyDocuments') ?? false, FILTER_VALIDATE_BOOLEAN);

        return $this->stays->checkInFromReservation(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
            $personsVal,
            $documentFiles,
            (array) $occupantTargets,
            (array) $occupants,
            $verifyDocuments,
            (array) $preBookingDocAssignments,
        );
    }
}
