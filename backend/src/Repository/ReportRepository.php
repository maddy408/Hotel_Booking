<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class ReportRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /** @return array{count:int, total:float} */
    public function checkoutsOn(int $hotelId, string $date): array
    {
        return $this->checkoutsInRange($hotelId, $date, $date);
    }

    /** @return array{count:int, total:float} */
    public function checkoutsInRange(int $hotelId, string $from, string $to): array
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS cnt, COALESCE(SUM(i.total_amount), 0) AS total
             FROM stays s LEFT JOIN invoices i ON i.stay_id = s.id
             WHERE s.hotel_id = :hotel_id AND s.status = 'checked_out'
               AND s.checkout_actual >= :from AND s.checkout_actual <= :to"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from, 'to' => $to]);
        $row = $stmt->fetch();
        return ['count' => (int) $row['cnt'], 'total' => (float) $row['total']];
    }

    public function advanceTakenOn(int $hotelId, string $date): float
    {
        return $this->advanceTakenInRange($hotelId, $date, $date);
    }

    public function advanceTakenInRange(int $hotelId, string $from, string $to): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM payments
             WHERE hotel_id = :hotel_id AND type = 'advance'
               AND DATE(created_at) >= :from AND DATE(created_at) <= :to"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from, 'to' => $to]);
        return (float) $stmt->fetchColumn();
    }

    public function balanceCollectedInRange(int $hotelId, string $from, string $to): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM payments
             WHERE hotel_id = :hotel_id AND type IN ('balance', 'extra')
               AND DATE(created_at) >= :from AND DATE(created_at) <= :to"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from, 'to' => $to]);
        return (float) $stmt->fetchColumn();
    }

    /** @return array{occupied:int, total:int} */
    public function currentOccupancy(int $hotelId): array
    {
        $total = (int) $this->scalar('SELECT COUNT(*) FROM rooms WHERE hotel_id = :hotel_id', ['hotel_id' => $hotelId]);
        $occupied = (int) $this->scalar(
            "SELECT COUNT(*) FROM stays WHERE hotel_id = :hotel_id AND status = 'in_house'",
            ['hotel_id' => $hotelId],
        );
        return ['occupied' => $occupied, 'total' => $total];
    }

    public function occupiedRoomsOnDate(int $hotelId, string $date): int
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(DISTINCT room_id) FROM stays
             WHERE hotel_id = :hotel_id AND status != 'cancelled'
               AND check_in_date <= :date1
               AND :date2 < COALESCE(checkout_actual, checkout_planned)"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'date1' => $date, 'date2' => $date]);
        return (int) $stmt->fetchColumn();
    }

    /** @return array<int,array<string,mixed>> one row per method: cash/upi/card */
    public function collectionByMethod(int $hotelId, string $date): array
    {
        return $this->collectionByMethodInRange($hotelId, $date, $date);
    }

    /** @return array<int,array<string,mixed>> one row per method: cash/upi/card */
    public function collectionByMethodInRange(int $hotelId, string $from, string $to): array
    {
        $stmt = $this->db->prepare(
            "SELECT method, COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0) AS total
             FROM payments WHERE hotel_id = :hotel_id
               AND DATE(created_at) >= :from AND DATE(created_at) <= :to
             GROUP BY method"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from, 'to' => $to]);
        return $stmt->fetchAll();
    }

    /** @return array{roomAmount:float, gstAmount:float, extrasAmount:float, discountAmount:float, total:float, invoiceCount:int} */
    public function revenueTotals(int $hotelId, string $from, string $to): array
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) AS cnt,
                    COALESCE(SUM(CASE WHEN room_amount > discount_amount THEN room_amount - discount_amount ELSE 0 END), 0) AS room_amount,
                    COALESCE(SUM(CASE WHEN total_amount = 0 THEN 0 ELSE (room_gst_amount + extras_gst_amount) END), 0) AS gst_amount,
                    COALESCE(SUM(extras_amount), 0) AS extras_amount,
                    COALESCE(SUM(discount_amount), 0) AS discount_amount,
                    COALESCE(SUM(total_amount), 0) AS total
             FROM invoices WHERE hotel_id = :hotel_id AND created_at >= :from AND created_at <= :to'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from . ' 00:00:00', 'to' => $to . ' 23:59:59']);
        $row = $stmt->fetch();
        return [
            'invoiceCount' => (int) $row['cnt'],
            'roomAmount' => (float) $row['room_amount'],
            'gstAmount' => (float) $row['gst_amount'],
            'extrasAmount' => (float) $row['extras_amount'],
            'discountAmount' => (float) ($row['discount_amount'] ?? 0),
            'total' => (float) $row['total'],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public function revenueByDay(int $hotelId, string $from, string $to): array
    {
        $stmt = $this->db->prepare(
            'SELECT DATE(created_at) AS day, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS cnt
             FROM invoices WHERE hotel_id = :hotel_id AND created_at >= :from AND created_at <= :to
             GROUP BY DATE(created_at) ORDER BY day'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'from' => $from . ' 00:00:00', 'to' => $to . ' 23:59:59']);
        return $stmt->fetchAll();
    }

    private function scalar(string $sql, array $params): mixed
    {
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchColumn();
    }
}
