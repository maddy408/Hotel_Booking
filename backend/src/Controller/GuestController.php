<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\GuestRepository;
use App\Repository\ReservationRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\GuestService;
use App\Support\ApiException;
use App\Support\Validator;

final class GuestController
{
    public function __construct(
        private readonly GuestRepository $guests,
        private readonly GuestService $guestService,
        private readonly StayRepository $stays,
        private readonly ReservationRepository $reservations,
    ) {
    }

    public function index(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $q = (string) $request->input('q', '');
        $rows = $this->guests->search($hotelId, $q);
        return array_map(function (array $g) {
            $public = $this->guestService->toPublic($g);
            $public['visits'] = $this->guests->visitCount((int) $g['id']);
            $public['now'] = $this->currentStatus((int) $g['id']);
            return $public;
        }, $rows);
    }

    public function lookup(Request $request): array
    {
        $phone = (string) $request->input('phone', '');
        $guest = $this->guestService->findByPhone((int) $request->attribute('hotelId'), $phone);
        return ['guest' => $guest === null ? null : $this->guestService->toPublic($guest)];
    }

    public function show(Request $request): array
    {
        $guest = $this->guests->find((int) $request->routeParams['id']);
        if ($guest === null || (int) $guest['hotel_id'] !== (int) $request->attribute('hotelId')) {
            throw ApiException::notFound('Guest not found.');
        }
        $public = $this->guestService->toPublic($guest);
        $public['visits'] = $this->guests->visitCount((int) $guest['id']);
        $public['history'] = $this->guests->history((int) $guest['id']);
        $public['now'] = $this->currentStatus((int) $guest['id']);
        return $public;
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'string',
            'phone' => 'phone',
            'idProofType' => 'in:Aadhaar,Driving Licence,Voter ID,Passport,Other',
        ]);
        $guest = $this->guestService->update(
            (int) $request->attribute('hotelId'),
            (int) $request->routeParams['id'],
            $data,
        );
        $public = $this->guestService->toPublic($guest);
        $public['visits'] = $this->guests->visitCount((int) $guest['id']);
        $public['history'] = $this->guests->history((int) $guest['id']);
        $public['now'] = $this->currentStatus((int) $guest['id']);
        return $public;
    }

    public function uploadIdImage(Request $request): array
    {
        if (empty($_FILES['image'])) {
            throw ApiException::validation(['image' => 'Choose an image to upload.']);
        }
        $guest = $this->guestService->uploadIdImage(
            (int) $request->attribute('hotelId'),
            (int) $request->routeParams['id'],
            $_FILES['image'],
        );
        return $this->guestService->toPublic($guest);
    }

    /** Streams the image directly — not wrapped in the JSON envelope. */
    public function downloadIdImage(Request $request): ?array
    {
        $path = $this->guestService->idImagePath((int) $request->attribute('hotelId'), (int) $request->routeParams['id']);
        header('Content-Type: ' . (mime_content_type($path) ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, max-age=0, no-store');
        readfile($path);
        return null;
    }

    /** @return array{type:string, roomNo:?int, stayId:?int, bookingId:?int, bookingDate:?string}|null */
    private function currentStatus(int $guestId): ?array
    {
        $stay = $this->stays->findInHouseByGuest($guestId);
        if ($stay !== null) {
            return ['type' => 'in_house', 'roomNo' => (int) $stay['room_no'], 'stayId' => (int) $stay['id'], 'bookingId' => null, 'bookingDate' => null];
        }
        $reservation = $this->reservations->findPendingByGuest($guestId);
        if ($reservation !== null) {
            return ['type' => 'booked', 'roomNo' => (int) $reservation['room_no'], 'stayId' => null, 'bookingId' => (int) $reservation['id'], 'bookingDate' => $reservation['check_in_date']];
        }
        return null;
    }
}
