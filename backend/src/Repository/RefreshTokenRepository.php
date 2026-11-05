<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class RefreshTokenRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function store(int $userId, string $tokenHash, int $expiresAtUnix): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (:user_id, :hash, :expires_at)'
        );
        $stmt->execute([
            'user_id' => $userId,
            'hash' => $tokenHash,
            'expires_at' => date('Y-m-d H:i:s', $expiresAtUnix),
        ]);
    }

    public function findValid(string $tokenHash): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, user_id, expires_at FROM refresh_tokens
             WHERE token_hash = :hash AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1'
        );
        $stmt->execute(['hash' => $tokenHash]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function revoke(string $tokenHash): void
    {
        $this->db->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = :hash')
            ->execute(['hash' => $tokenHash]);
    }

    public function revokeAllForUser(int $userId): void
    {
        $this->db->prepare('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = :user_id AND revoked_at IS NULL')
            ->execute(['user_id' => $userId]);
    }
}
