<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class HousekeepingLogRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function log(int $roomId, string $action, ?string $note, ?int $changedBy): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO housekeeping_logs (room_id, action, note, changed_by) VALUES (:room_id, :action, :note, :changed_by)'
        );
        $stmt->execute(['room_id' => $roomId, 'action' => $action, 'note' => $note, 'changed_by' => $changedBy]);
    }

    /** @return array<int,array<string,mixed>> */
    public function forRoom(int $roomId, int $limit = 20): array
    {
        $stmt = $this->db->prepare(
            'SELECT h.*, u.name AS changed_by_name FROM housekeeping_logs h
             LEFT JOIN users u ON u.id = h.changed_by
             WHERE h.room_id = :room_id ORDER BY h.id DESC LIMIT :limit'
        );
        $stmt->bindValue('room_id', $roomId, PDO::PARAM_INT);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
