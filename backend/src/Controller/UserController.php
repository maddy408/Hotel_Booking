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
        if ((!isset($data['role']) || $data['role'] === '') && !empty($data['role_code'])) {
            $data['role'] = $data['role_code'];
        } elseif ((!isset($data['role']) || $data['role'] === '') && !empty($data['role_id'])) {
            foreach ($this->users->roles() as $r) {
                if ((int) $r['id'] === (int) $data['role_id']) {
                    $data['role'] = $r['code'];
                    break;
                }
            }
        }
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
        if ((!isset($data['role']) || $data['role'] === '') && !empty($data['role_code'])) {
            $data['role'] = $data['role_code'];
        } elseif ((!isset($data['role']) || $data['role'] === '') && !empty($data['role_id'])) {
            foreach ($this->users->roles() as $r) {
                if ((int) $r['id'] === (int) $data['role_id']) {
                    $data['role'] = $r['code'];
                    break;
                }
            }
        }
        if (!isset($data['isActive']) && isset($data['is_active'])) {
            $data['isActive'] = (bool) $data['is_active'];
        }
        $rules = [
            'name' => 'required|string|max:100',
            'email' => 'email',
            'role' => 'required|in:admin,manager,receptionist,housekeeping',
        ];
        if (isset($data['username']) && $data['username'] !== '') {
            $rules['username'] = 'string|max:50';
        }
        if (!empty($data['password'])) {
            $rules['password'] = 'string|min:8';
        }
        Validator::assert($data, $rules);
        return $this->users->update(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            trim((string) $data['name']),
            $data['email'] ?? null,
            $data['phone'] ?? null,
            (string) $data['role'],
            (bool) ($data['isActive'] ?? true),
            (int) $request->attribute('userId'),
            isset($data['username']) && trim((string) $data['username']) !== '' ? trim((string) $data['username']) : null,
            !empty($data['password']) ? (string) $data['password'] : null,
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

    public function delete(Request $request): array
    {
        $this->users->delete(
            (int) $request->routeParams['id'],
            (int) $request->attribute('hotelId'),
            (int) $request->attribute('userId'),
        );
        return ['deleted' => true];
    }
}
