<?php

declare(strict_types=1);

namespace App\Repository;

use PDO;

final class InvoiceRepository
{
    public function __construct(private readonly PDO $db)
    {
    }

    /** Caller must already hold a lock (see InvoiceService) serializing this per hotel+FY. */
    public function nextSequence(int $hotelId, string $financialYear): int
    {
        $stmt = $this->db->prepare(
            'SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM invoices WHERE hotel_id = :hotel_id AND financial_year = :fy'
        );
        $stmt->execute(['hotel_id' => $hotelId, 'fy' => $financialYear]);
        return (int) $stmt->fetchColumn();
    }

    public function create(array $invoice): int
    {
        $stmt = $this->db->prepare(
            'INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, guest_gstin,
                    room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount,
                    total_amount, advance_paid, balance_amount)
             VALUES (:hotel_id, :stay_id, :invoice_number, :financial_year, :sequence_no, :guest_gstin,
                    :room_amount, :gst_rate, :room_gst_amount, :extras_amount, :extras_gst_amount, :cgst_amount, :sgst_amount,
                    :total_amount, :advance_paid, :balance_amount)'
        );
        $stmt->execute($invoice);
        return (int) $this->db->lastInsertId();
    }

    public function findByStay(int $stayId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM invoices WHERE stay_id = :stay_id');
        $stmt->execute(['stay_id' => $stayId]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function find(int $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM invoices WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /** @return array<int,array<string,mixed>> */
    public function listForRange(int $hotelId, ?string $from, ?string $to): array
    {
        $sql = 'SELECT * FROM invoices WHERE hotel_id = :hotel_id';
        $params = ['hotel_id' => $hotelId];
        if ($from !== null) {
            $sql .= ' AND created_at >= :from';
            $params['from'] = $from . ' 00:00:00';
        }
        if ($to !== null) {
            $sql .= ' AND created_at <= :to';
            $params['to'] = $to . ' 23:59:59';
        }
        $sql .= ' ORDER BY id DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
