<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\InvoiceRepository;
use App\Repository\ReportRepository;

final class ReportService
{
    public function __construct(
        private readonly ReportRepository $reports,
        private readonly InvoiceRepository $invoices,
    ) {
    }

    public function today(int $hotelId): array
    {
        $date = date('Y-m-d');
        $checkouts = $this->reports->checkoutsOn($hotelId, $date);
        $occupancy = $this->reports->currentOccupancy($hotelId);

        return [
            'date' => $date,
            'checkouts' => $checkouts['count'],
            'billedAtCheckout' => $checkouts['total'],
            'advanceTaken' => $this->reports->advanceTakenOn($hotelId, $date),
            'occupancy' => [
                'occupied' => $occupancy['occupied'],
                'total' => $occupancy['total'],
                'percent' => $occupancy['total'] > 0 ? round($occupancy['occupied'] / $occupancy['total'] * 100, 1) : 0.0,
            ],
        ];
    }

    public function dayEnd(int $hotelId, string $date): array
    {
        $rows = $this->reports->collectionByMethod($hotelId, $date);
        $byMethod = ['cash' => 0.0, 'upi' => 0.0, 'card' => 0.0];
        foreach ($rows as $row) {
            $byMethod[$row['method']] = (float) $row['total'];
        }
        return [
            'date' => $date,
            'byMethod' => $byMethod,
            'total' => array_sum($byMethod),
            'occupiedRooms' => $this->reports->occupiedRoomsOnDate($hotelId, $date),
        ];
    }

    public function occupancy(int $hotelId, string $from, string $to): array
    {
        $totals = $this->reports->currentOccupancy($hotelId);
        $days = [];
        $cursor = new \DateTimeImmutable($from);
        $end = new \DateTimeImmutable($to);
        while ($cursor <= $end) {
            $d = $cursor->format('Y-m-d');
            $occupied = $this->reports->occupiedRoomsOnDate($hotelId, $d);
            $days[] = [
                'date' => $d,
                'occupied' => $occupied,
                'total' => $totals['total'],
                'percent' => $totals['total'] > 0 ? round($occupied / $totals['total'] * 100, 1) : 0.0,
            ];
            $cursor = $cursor->modify('+1 day');
        }
        return ['totalRooms' => $totals['total'], 'days' => $days];
    }

    public function revenue(int $hotelId, string $from, string $to): array
    {
        return [
            'from' => $from,
            'to' => $to,
            'totals' => $this->reports->revenueTotals($hotelId, $from, $to),
            'byDay' => $this->reports->revenueByDay($hotelId, $from, $to),
        ];
    }

    public function invoicesCsv(int $hotelId, string $from, string $to): string
    {
        $rows = $this->invoices->listForRange($hotelId, $from, $to);
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['Invoice', 'Date', 'Financial Year', 'Room Amount', 'GST', 'Extras', 'Total', 'Advance Paid', 'Balance']);
        foreach ($rows as $r) {
            fputcsv($out, [
                $r['invoice_number'],
                $r['created_at'],
                $r['financial_year'],
                $r['room_amount'],
                round((float) $r['room_gst_amount'] + (float) $r['extras_gst_amount'], 2),
                $r['extras_amount'],
                $r['total_amount'],
                $r['advance_paid'],
                $r['balance_amount'],
            ]);
        }
        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);
        return $csv;
    }
}
