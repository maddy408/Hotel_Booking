<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class RoleRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function findByCode(string $code): ?array
    {
        $stmt = $this->db->prepare('SELECT id, code, name FROM roles WHERE code = :code LIMIT 1');
        $stmt->execute(['code' => $code]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public function all(): array
    {
        return $this->db->query('SELECT id, code, name FROM roles ORDER BY id')->fetchAll();
    }
}
