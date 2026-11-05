<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use App\Support\ApiException;
use App\Support\AuditLogger;

final class UserService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly RoleRepository $roles,
        private readonly AuditLogger $audit,
    ) {
    }

    public function list(int $hotelId): array
    {
        return $this->users->allForHotel($hotelId);
    }

    public function create(int $hotelId, string $name, string $username, ?string $email, ?string $phone, string $roleCode, string $password, ?int $actingUserId): array
    {
        if ($this->users->usernameExists($username)) {
            throw ApiException::validation(['username' => 'This username is already taken.']);
        }
        $role = $this->roles->findByCode($roleCode);
        if ($role === null) {
            throw ApiException::validation(['role' => 'Unknown role.']);
        }
        $id = $this->users->create($hotelId, (int) $role['id'], $name, $username, $email, $phone, password_hash($password, PASSWORD_BCRYPT));
        $this->audit->log($hotelId, $actingUserId, 'user_create', 'user', $id, null, ['username' => $username, 'role' => $roleCode]);
        return $this->users->findById($id);
    }

    public function update(int $id, int $hotelId, string $name, ?string $email, ?string $phone, string $roleCode, bool $isActive, ?int $actingUserId): array
    {
        $before = $this->users->findById($id);
        if ($before === null || (int) $before['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('User not found.');
        }
        $role = $this->roles->findByCode($roleCode);
        if ($role === null) {
            throw ApiException::validation(['role' => 'Unknown role.']);
        }
        $this->users->update($id, $name, $email, $phone, (int) $role['id'], $isActive);
        $after = $this->users->findById($id);
        $this->audit->log($hotelId, $actingUserId, 'user_update', 'user', $id, $before, $after);
        return $after;
    }

    public function resetPassword(int $id, int $hotelId, string $password, ?int $actingUserId): void
    {
        $user = $this->users->findById($id);
        if ($user === null || (int) $user['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('User not found.');
        }
        $this->users->updatePassword($id, password_hash($password, PASSWORD_BCRYPT));
        $this->audit->log($hotelId, $actingUserId, 'password_reset', 'user', $id, null, null);
    }

    public function roles(): array
    {
        return $this->roles->all();
    }
}
