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

    public function today(int $hotelId, ?string $from = null, ?string $to = null): array
    {
        if ($from !== null && $to !== null) {
            return $this->summary($hotelId, $from, $to);
        }
        $date = date('Y-m-d');
        return $this->summary($hotelId, $date, $date);
    }

    public function summary(int $hotelId, string $from, string $to): array
    {
        $todayDate = date('Y-m-d');
        $checkouts = $this->reports->checkoutsInRange($hotelId, $from, $to);
        $totals = $this->reports->currentOccupancy($hotelId);
        $totalRooms = $totals['total'];

        if ($from === $to && $from === $todayDate) {
            $occData = [
                'occupied' => $totals['occupied'],
                'total' => $totalRooms,
                'percent' => $totalRooms > 0 ? round($totals['occupied'] / $totalRooms * 100, 1) : 0.0,
            ];
        } elseif ($from === $to) {
            $occupied = $this->reports->occupiedRoomsOnDate($hotelId, $from);
            $occData = [
                'occupied' => $occupied,
                'total' => $totalRooms,
                'percent' => $totalRooms > 0 ? round($occupied / $totalRooms * 100, 1) : 0.0,
            ];
        } else {
            // For date ranges: calculate period totals and daily breakdowns where appropriate.
            // Follow the existing web application's occupancy calculation rules:
            // Do not add daily occupancy counts together and treat the result as one occupancy figure.
            $cursor = new \DateTimeImmutable($from);
            $end = new \DateTimeImmutable($to);
            $sumOccupied = 0;
            $dayCount = 0;
            while ($cursor <= $end) {
                $d = $cursor->format('Y-m-d');
                $sumOccupied += $this->reports->occupiedRoomsOnDate($hotelId, $d);
                $dayCount++;
                $cursor = $cursor->modify('+1 day');
            }
            $avgOccupied = $dayCount > 0 ? round($sumOccupied / $dayCount, 1) : 0.0;
            $totalPossible = $totalRooms * $dayCount;
            $percent = $totalPossible > 0 ? round($sumOccupied / $totalPossible * 100, 1) : 0.0;
            $occData = [
                'occupied' => $avgOccupied,
                'total' => $totalRooms,
                'percent' => $percent,
                'days' => $dayCount,
            ];
        }

        return [
            'date' => $from === $to ? $from : null,
            'from' => $from,
            'to' => $to,
            'checkouts' => $checkouts['count'],
            'billedAtCheckout' => $checkouts['total'],
            'advanceTaken' => $this->reports->advanceTakenInRange($hotelId, $from, $to),
            'occupancy' => $occData,
        ];
    }

    public function dayEnd(int $hotelId, string $date, ?string $to = null): array
    {
        $from = $date;
        $toDate = $to ?: $from;
        $rows = $this->reports->collectionByMethodInRange($hotelId, $from, $toDate);
        $byMethod = ['cash' => 0.0, 'upi' => 0.0, 'card' => 0.0];
        foreach ($rows as $row) {
            $byMethod[$row['method']] = (float) $row['total'];
        }
        $occupiedRooms = $from === $toDate
            ? $this->reports->occupiedRoomsOnDate($hotelId, $from)
            : (int) round($this->reports->currentOccupancy($hotelId)['occupied']);

        return [
            'date' => $from === $toDate ? $from : null,
            'from' => $from,
            'to' => $toDate,
            'byMethod' => $byMethod,
            'total' => array_sum($byMethod),
            'occupiedRooms' => $occupiedRooms,
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
        fputcsv($out, ['Invoice', 'Date', 'Financial Year', 'Room Amount', 'GST', 'Extras', 'Total', 'Advance Paid', 'Balance'], ',', '"', '\\');
        foreach ($rows as $r) {
            $formattedDate = !empty($r['created_at']) ? date('Y-m-d', strtotime((string) $r['created_at'])) : '';
            fputcsv($out, [
                $r['invoice_number'],
                $formattedDate,
                $r['financial_year'],
                $r['room_amount'],
                round((float) $r['room_gst_amount'] + (float) $r['extras_gst_amount'], 2),
                $r['extras_amount'],
                $r['total_amount'],
                $r['advance_paid'],
                $r['balance_amount'],
            ], ',', '"', '\\');
        }
        rewind($out);
        $csv = stream_get_contents($out) ?: '';
        fclose($out);
        return $csv;
    }
}
