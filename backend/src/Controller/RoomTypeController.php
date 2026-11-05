<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\RoomTypeRepository;
use App\Router\Request;
use App\Service\RoomService;
use App\Support\Validator;

final class RoomTypeController
{
    public function __construct(
        private readonly RoomService $roomService,
        private readonly RoomTypeRepository $roomTypes,
    ) {
    }

    public function index(Request $request): array
    {
        return $this->roomTypes->allForHotel((int) $request->attribute('hotelId'));
    }

    public function create(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'required|string|max:100',
            'rate' => 'required|numeric|min:0',
            'maxPersons' => 'required|integer|min:1',
        ]);
        return $this->roomService->addRoomType(
            (int) $request->attribute('hotelId'),
            trim((string) $data['name']),
            (float) $data['rate'],
            (int) $data['maxPersons'],
        );
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'required|string|max:100',
            'rate' => 'required|numeric|min:0',
            'maxPersons' => 'required|integer|min:1',
        ]);
        return $this->roomService->updateRoomType(
            (int) $request->routeParams['id'],
            trim((string) $data['name']),
            (float) $data['rate'],
            (int) $data['maxPersons'],
            (int) $request->attribute('userId'),
            (int) $request->attribute('hotelId'),
        );
    }

    public function delete(Request $request): array
    {
        $this->roomService->deleteRoomType((int) $request->routeParams['id'], (int) $request->attribute('hotelId'));
        return ['deleted' => true];
    }
}
