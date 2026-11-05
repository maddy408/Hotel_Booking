<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\InvoiceRepository;
use PDO;

/**
 * Generates the sequential GST invoice number for a finished stay. The caller's
 * transaction must lock the hotel's `settings` row first (see lockMutex()) so two
 * concurrent checkouts can never be issued the same sequence number.
 */
final class InvoiceService
{
    public function __construct(
        private readonly PDO $db,
        private readonly InvoiceRepository $invoices,
    ) {
    }

    /** Serializes invoice numbering per hotel using the always-present settings row as a mutex. */
    public function lockMutex(int $hotelId): array
    {
        $stmt = $this->db->prepare('SELECT * FROM settings WHERE hotel_id = :hotel_id FOR UPDATE');
        $stmt->execute(['hotel_id' => $hotelId]);
        return $stmt->fetch() ?: [];
    }

    public function financialYear(string $date, int $startMonth): string
    {
        $d = new \DateTimeImmutable($date);
        $year = (int) $d->format('Y');
        $month = (int) $d->format('n');
        $fyStartYear = $month >= $startMonth ? $year : $year - 1;
        return $fyStartYear . '-' . substr((string) ($fyStartYear + 1), -2);
    }

    /** @param array<string,mixed> $bill */
    public function issue(int $hotelId, int $stayId, array $settings, array $bill, ?string $guestGstin): array
    {
        $fy = $this->financialYear(date('Y-m-d'), (int) $settings['financial_year_start_month']);
        $sequence = $this->invoices->nextSequence($hotelId, $fy);
        $number = sprintf('%s-%s-%04d', $settings['invoice_prefix'], $fy, $sequence);

        $halfGst = round(($bill['roomGstAmount'] + $bill['extrasGstAmount']) / 2, 2);

        $id = $this->invoices->create([
            'hotel_id' => $hotelId,
            'stay_id' => $stayId,
            'invoice_number' => $number,
            'financial_year' => $fy,
            'sequence_no' => $sequence,
            'guest_gstin' => $guestGstin,
            'room_amount' => $bill['roomAmount'],
            'gst_rate' => $bill['gstRate'],
            'room_gst_amount' => $bill['roomGstAmount'],
            'extras_amount' => $bill['extrasAmount'],
            'extras_gst_amount' => $bill['extrasGstAmount'],
            'cgst_amount' => $halfGst,
            'sgst_amount' => $halfGst,
            'total_amount' => $bill['total'],
            'advance_paid' => $bill['advancePaid'],
            'balance_amount' => max(0, $bill['balance']),
        ]);

        return $this->invoices->find($id);
    }
}
