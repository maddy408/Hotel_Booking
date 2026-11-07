<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\RoomService;
use App\Support\Validator;

final class RoomController
{
    public function __construct(private readonly RoomService $roomService)
    {
    }

    public function index(Request $request): array
    {
        return $this->roomService->listRooms((int) $request->attribute('hotelId'));
    }

    public function bulkAdd(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'floor' => 'required|integer|min:0',
            'from' => 'required|integer|min:1',
            'roomTypeId' => 'required|integer|min:1',
        ]);
        $to = $data['to'] ?? $data['from'];
        return $this->roomService->bulkAddRooms(
            (int) $request->attribute('hotelId'),
            (int) $data['floor'],
            (int) $data['from'],
            (int) $to,
            (int) $data['roomTypeId'],
        );
    }

    public function changeType(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['roomTypeId' => 'required|integer|min:1']);
        return $this->roomService->changeRoomType((int) $request->routeParams['id'], (int) $data['roomTypeId'], (int) $request->attribute('hotelId'));
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'roomNo' => 'required|integer|min:1',
            'floor' => 'required|integer|min:0',
            'roomTypeId' => 'required|integer|min:1',
        ]);
        return $this->roomService->updateRoom(
            (int) $request->routeParams['id'],
            (int) $data['roomNo'],
            (int) $data['floor'],
            (int) $data['roomTypeId'],
            isset($data['note']) ? trim((string) $data['note']) : null,
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
    }

    public function delete(Request $request): array
    {
        $this->roomService->deleteRoom(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
        return ['deleted' => true];
    }

    public function housekeeping(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['action' => 'required|in:ready,cleaning,repair']);
        return $this->roomService->setHousekeeping(
            (int) $request->routeParams['id'],
            (string) $data['action'],
            $data['note'] ?? null,
            (int) $request->attribute('userId'),
            (int) $request->attribute('hotelId'),
        );
    }
}
