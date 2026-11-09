<?php

declare(strict_types=1);

namespace App\Support;

use App\Repository\AuditLogRepository;

/** Thin convenience wrapper so services don't need to know the repository's full signature. */
class AuditLogger
{
    public function __construct(private readonly AuditLogRepository $repository)
    {
    }

    public function log(int $hotelId, ?int $userId, string $action, string $entityType, ?int $entityId, ?array $before, ?array $after, ?string $ip = null): void
    {
        $this->repository->log($hotelId, $userId, $action, $entityType, $entityId, $before, $after, $ip);
    }
}
