<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

class PaymentRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function record(
        int $hotelId,
        ?int $reservationId,
        ?int $stayId,
        string $type,
        float $amount,
        string $method,
        ?int $receivedBy,
        ?string $note = null,
        string $status = 'successful',
        ?int $parentPaymentId = null,
        ?string $reason = null
    ): int {
        $stmt = $this->db->prepare(
            'INSERT INTO payments (hotel_id, reservation_id, stay_id, parent_payment_id, type, amount, method, status, received_by, note, reason)
             VALUES (:hotel_id, :reservation_id, :stay_id, :parent_payment_id, :type, :amount, :method, :status, :received_by, :note, :reason)'
        );
        $stmt->execute([
            'hotel_id' => $hotelId,
            'reservation_id' => $reservationId,
            'stay_id' => $stayId,
            'parent_payment_id' => $parentPaymentId,
            'type' => $type,
            'amount' => $amount,
            'method' => $method,
            'status' => $status,
            'received_by' => $receivedBy,
            'note' => $note,
            'reason' => $reason,
        ]);
        return (int) $this->db->lastInsertId();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    public function lockForUpdate(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM payments WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public function forStay(int $stayId): array
    {
        $stmt = $this->db->prepare('SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.stay_id = :stay_id ORDER BY p.id');
        $stmt->execute(['stay_id' => $stayId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<int,array<string,mixed>> */
    public function forReservation(int $reservationId): array
    {
        $stmt = $this->db->prepare('SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.reservation_id = :reservation_id ORDER BY p.id');
        $stmt->execute(['reservation_id' => $reservationId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Net amount already settled toward a stay, counting its originating reservation's payments too. Only counts successful payments. */
    public function netSettledForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                FROM payments WHERE stay_id = :stay_id AND status = 'successful'";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                    FROM payments WHERE (stay_id = :stay_id OR reservation_id = :reservation_id) AND status = 'successful'";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** Net successful advance payment recorded for a reservation. Only counts successful payments. */
    public function netAdvanceForReservation(int $reservationId, ?int $hotelId = null): float
    {
        $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                FROM payments
                WHERE reservation_id = :reservation_id
                  AND type IN ('advance', 'refund')
                  AND status = 'successful'";
        $params = ['reservation_id' => $reservationId];
        if ($hotelId !== null) {
            $sql .= ' AND hotel_id = :hotel_id';
            $params['hotel_id'] = $hotelId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** All payments for a stay, including advance payments made against its reservation. */
    public function forStayWithReservation(int $stayId, ?int $reservationId): array
    {
        $sql = 'SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.stay_id = :stay_id';
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = 'SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.stay_id = :stay_id OR p.reservation_id = :reservation_id';
            $params['reservation_id'] = $reservationId;
        }
        $sql .= ' ORDER BY p.id ASC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Net successful advance payments recorded for a stay (including originating reservation). */
    public function advancePaidForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                FROM payments
                WHERE stay_id = :stay_id AND type = 'advance' AND status = 'successful'";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END), 0)
                    FROM payments
                    WHERE (stay_id = :stay_id OR reservation_id = :reservation_id)
                      AND type = 'advance'
                      AND status = 'successful'";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** Other successful payments (balance, extra) for a stay. */
    public function otherSuccessfulPaymentsForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                WHERE stay_id = :stay_id AND type IN ('balance', 'extra') AND status = 'successful'";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                    WHERE (stay_id = :stay_id OR reservation_id = :reservation_id)
                      AND type IN ('balance', 'extra')
                      AND status = 'successful'";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** Total successful payments (advance + balance + extra) recorded for a stay. */
    public function totalSuccessfulPaidForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                WHERE stay_id = :stay_id AND type IN ('advance', 'balance', 'extra') AND status = 'successful'";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                    WHERE (stay_id = :stay_id OR reservation_id = :reservation_id)
                      AND type IN ('advance', 'balance', 'extra')
                      AND status = 'successful'";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** Total successful refunded amount for a stay (including originating reservation). */
    public function totalRefundedForStay(int $stayId, ?int $reservationId): float
    {
        $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                WHERE stay_id = :stay_id AND type = 'refund' AND status = 'successful'";
        $params = ['stay_id' => $stayId];
        if ($reservationId !== null) {
            $sql = "SELECT COALESCE(SUM(amount), 0) FROM payments
                    WHERE (stay_id = :stay_id OR reservation_id = :reservation_id)
                      AND type = 'refund'
                      AND status = 'successful'";
            $params['reservation_id'] = $reservationId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return (float) $stmt->fetchColumn();
    }

    /** Total successful refunded amount for a reservation. */
    public function totalRefundedForReservation(int $reservationId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM payments
             WHERE reservation_id = :reservation_id AND type = 'refund' AND status = 'successful'"
        );
        $stmt->execute(['reservation_id' => $reservationId]);
        return (float) $stmt->fetchColumn();
    }

    /** Total successful refunded amount against a specific parent payment. */
    public function totalRefundedForPayment(int $parentPaymentId): float
    {
        $stmt = $this->db->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM payments
             WHERE parent_payment_id = :parent_id AND type = 'refund' AND status = 'successful'"
        );
        $stmt->execute(['parent_id' => $parentPaymentId]);
        return (float) $stmt->fetchColumn();
    }

    /** Remaining refundable balance on a specific original payment. */
    public function remainingBalanceForPayment(int $paymentId): float
    {
        $payment = $this->find($paymentId);
        if ($payment === null || $payment['status'] !== 'successful' || $payment['type'] === 'refund') {
            return 0.0;
        }
        $refunded = $this->totalRefundedForPayment($paymentId);
        return max(0.0, round((float) $payment['amount'] - $refunded, 2));
    }

    /** Return all successful payments for a reservation. */
    public function successfulPaymentsForReservation(int $reservationId): array
    {
        $stmt = $this->db->prepare(
            "SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by
             WHERE p.reservation_id = :res_id AND p.status = 'successful' AND p.type != 'refund'
             ORDER BY p.id ASC"
        );
        $stmt->execute(['res_id' => $reservationId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Return all pending payments for a reservation. */
    public function pendingPaymentsForReservation(int $reservationId): array
    {
        $stmt = $this->db->prepare(
            "SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by
             WHERE p.reservation_id = :res_id AND p.status = 'pending'
             ORDER BY p.id ASC"
        );
        $stmt->execute(['res_id' => $reservationId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Return all failed payments for a reservation. */
    public function failedPaymentsForReservation(int $reservationId): array
    {
        $stmt = $this->db->prepare(
            "SELECT p.*, u.name AS processed_by_name FROM payments p LEFT JOIN users u ON u.id = p.received_by
             WHERE p.reservation_id = :res_id AND p.status = 'failed'
             ORDER BY p.id ASC"
        );
        $stmt->execute(['res_id' => $reservationId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
