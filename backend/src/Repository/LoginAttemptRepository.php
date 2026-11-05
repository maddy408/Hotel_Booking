<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class LoginAttemptRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function record(string $username, string $ip, bool $success): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO login_attempts (username, ip_address, success) VALUES (:username, :ip, :success)'
        );
        $stmt->execute(['username' => $username, 'ip' => $ip, 'success' => $success ? 1 : 0]);
    }

    public function recentFailureCount(string $username, string $ip, int $windowSeconds): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE username = :username AND ip_address = :ip AND success = 0
               AND created_at > DATE_SUB(NOW(), INTERVAL :window SECOND)'
        );
        $stmt->bindValue('username', $username);
        $stmt->bindValue('ip', $ip);
        $stmt->bindValue('window', $windowSeconds, PDO::PARAM_INT);
        $stmt->execute();
        return (int) $stmt->fetchColumn();
    }
}
