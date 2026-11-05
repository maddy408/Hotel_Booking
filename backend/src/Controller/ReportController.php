<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\ReportService;
use App\Support\ApiException;
use App\Support\Validator;

final class ReportController
{
    public function __construct(private readonly ReportService $reports)
    {
    }

    public function today(Request $request): array
    {
        return $this->reports->today((int) $request->attribute('hotelId'));
    }

    public function dayEnd(Request $request): array
    {
        $date = (string) $request->input('date', date('Y-m-d'));
        return $this->reports->dayEnd((int) $request->attribute('hotelId'), $date);
    }

    public function occupancy(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['from' => 'required|date', 'to' => 'required|date']);
        return $this->reports->occupancy((int) $request->attribute('hotelId'), (string) $data['from'], (string) $data['to']);
    }

    public function revenue(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, ['from' => 'required|date', 'to' => 'required|date']);
        return $this->reports->revenue((int) $request->attribute('hotelId'), (string) $data['from'], (string) $data['to']);
    }

    /** Streams a CSV directly — bypasses the JSON envelope on success, matching standard file-download semantics. */
    public function exportCsv(Request $request): ?array
    {
        $data = $request->all();
        if (!isset($data['from'], $data['to'])) {
            throw ApiException::validation(['from' => 'Required.', 'to' => 'Required.']);
        }
        $csv = $this->reports->invoicesCsv((int) $request->attribute('hotelId'), (string) $data['from'], (string) $data['to']);
        http_response_code(200);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="invoices_' . $data['from'] . '_to_' . $data['to'] . '.csv"');
        echo $csv;
        return null; // signal to the router that the response is already sent
    }
}
