<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\UserService;
use App\Support\ApiException;
use App\Support\Validator;

final class UserController
{
    public function __construct(private readonly UserService $users)
    {
    }

    public function index(Request $request): array
    {
        return $this->users->list((int) $request->attribute('hotelId'));
    }

    public function roles(): array
    {
        return $this->users->roles();
    }

    public function create(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'required|string|max:100',
            'username' => 'required|string|max:50',
            'email' => 'email',
            'role' => 'required|in:admin,manager,receptionist,housekeeping',
            'password' => 'required|string|min:8',
        ]);
        return $this->users->create(
            (int) $request->attribute('hotelId'),
            trim((string) $data['name']),
            trim((string) $data['username']),
            $data['email'] ?? null,
            $data['phone'] ?? null,
            (string) $data['role'],
            (string) $data['password'],
            (int) $request->attribute('userId'),
        );
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'required|string|max:100',
            'email' => 'email',
            'role' => 'required|in:admin,manager,receptionist,housekeeping',
        ]);
        return $this->users->update(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            trim((string) $data['name']),
            $data['email'] ?? null,
            $data['phone'] ?? null,
            (string) $data['role'],
            (bool) ($data['isActive'] ?? true),
            (int) $request->attribute('userId'),
        );
    }

    public function resetPassword(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['password' => 'required|string|min:8']);
        $this->users->resetPassword(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (string) $data['password'],
            (int) $request->attribute('userId'),
        );
        return ['reset' => true];
    }
}
