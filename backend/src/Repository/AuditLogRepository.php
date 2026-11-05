<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class AuditLogRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function log(
        int $hotelId,
        ?int $userId,
        string $action,
        string $entityType,
        ?int $entityId,
        ?array $before,
        ?array $after,
        ?string $ip,
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO audit_logs (hotel_id, user_id, action, entity_type, entity_id, before_json, after_json, ip_address)
             VALUES (:hotel_id, :user_id, :action, :entity_type, :entity_id, :before_json, :after_json, :ip)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'user_id' => $userId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'before_json' => $before === null ? null : json_encode($before),
            'after_json' => $after === null ? null : json_encode($after),
            'ip' => $ip,
        ]);
    }

    /** @return array<int,array<string,mixed>> */
    public function recent(int $hotelId, int $limit = 100): array
    {
        $stmt = $this->db->prepare(
            'SELECT a.*, u.name AS user_name FROM audit_logs a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE a.hotel_id = :hotel_id ORDER BY a.id DESC LIMIT :limit'
        );
        $stmt->bindValue('hotel_id', $hotelId, PDO::PARAM_INT);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
