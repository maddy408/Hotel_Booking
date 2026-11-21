<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class UserRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function findByUsername(string $username): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.hotel_id, u.name, u.username, u.email, u.phone, u.password_hash, u.is_active,
                    r.code AS role_code, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.username = :username LIMIT 1'
        );
        $stmt->execute(['username' => $username]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.hotel_id, u.name, u.username, u.email, u.phone, u.is_active,
                    r.code AS role_code, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function touchLastLogin(int $id): void
    {
        $this->db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute(['id' => $id]);
    }

    /** @return array<int,array<string,mixed>> */
    public function allForHotel(int $hotelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT u.id, u.name, u.username, u.email, u.phone, u.is_active, u.last_login_at,
                    r.code AS role_code, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.hotel_id = :hotel_id ORDER BY u.name'
        );
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetchAll();
    }

    public function usernameExists(string $username): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM users WHERE username = :username LIMIT 1');
        $stmt->execute(['username' => $username]);
        return $stmt->fetch() !== false;
    }

    public function usernameExistsExcept(string $username, int $excludeId): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM users WHERE username = :username AND id != :exclude_id LIMIT 1');
        $stmt->execute(['username' => $username, 'exclude_id' => $excludeId]);
        return $stmt->fetch() !== false;
    }

    public function create(int $hotelId, int $roleId, string $name, string $username, ?string $email, ?string $phone, string $passwordHash): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO users (hotel_id, role_id, name, username, email, phone, password_hash)
             VALUES (:hotel_id, :role_id, :name, :username, :email, :phone, :password_hash)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'role_id' => $roleId,
            'name' => $name,
            'username' => $username,
            'email' => $email,
            'phone' => $phone,
            'password_hash' => $passwordHash,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function update(int $id, string $name, ?string $email, ?string $phone, int $roleId, bool $isActive, ?string $username = null, ?string $passwordHash = null): void
    {
        $fields = [
            'name = :name',
            'email = :email',
            'phone = :phone',
            'role_id = :role_id',
            'is_active = :is_active',
        ];
        $params = [
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'role_id' => $roleId,
            'is_active' => $isActive ? 1 : 0,
            'id' => $id,
        ];
        if ($username !== null && $username !== '') {
            $fields[] = 'username = :username';
            $params['username'] = $username;
        }
        if ($passwordHash !== null && $passwordHash !== '') {
            $fields[] = 'password_hash = :password_hash';
            $params['password_hash'] = $passwordHash;
        }
        $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = :id';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
    }

    public function updatePassword(int $id, string $passwordHash): void
    {
        $this->db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')
            ->execute(['hash' => $passwordHash, 'id' => $id]);
    }
}
