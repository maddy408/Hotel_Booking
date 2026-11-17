<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\OccupantDocumentService;
use App\Support\ApiException;
use App\Support\OccupantDocumentUploader;

final class OccupantDocumentController
{
    public function __construct(private readonly OccupantDocumentService $service)
    {
    }

    /** Lists all documents for a stay */
    public function listByStay(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $stayId = (int) $request->routeParams['id'];
        return $this->service->getDocumentsForStay($hotelId, $stayId);
    }

    /** Lists all documents for a reservation */
    public function listByReservation(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $reservationId = (int) $request->routeParams['id'];
        return $this->service->getDocumentsForReservation($hotelId, $reservationId);
    }

    /** Uploads documents to an existing reservation */
    public function uploadToReservation(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $reservationId = (int) $request->routeParams['id'];

        $filesInput = $request->file('documents') ?? $request->file('files') ?? $_FILES['documents'] ?? $_FILES['files'] ?? null;
        $normalized = OccupantDocumentUploader::normalizeFiles($filesInput);

        if (empty($normalized)) {
            throw ApiException::validation(['documents' => 'Please select at least one document to upload.']);
        }

        return $this->service->uploadDocumentsForReservation($hotelId, $reservationId, $normalized);
    }

    /** Lists occupants and their documents for a stay */
    public function listOccupantsByStay(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $stayId = (int) $request->routeParams['id'];
        return $this->service->getOccupantsWithDocumentsForStay($hotelId, $stayId);
    }

    /** Uploads one or more documents to a stay */
    public function uploadToStay(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $stayId = (int) $request->routeParams['id'];

        $filesInput = $request->file('documents') ?? $request->file('files') ?? $_FILES['documents'] ?? $_FILES['files'] ?? null;
        $normalized = OccupantDocumentUploader::normalizeFiles($filesInput);

        if (empty($normalized)) {
            throw ApiException::validation(['documents' => 'Please select at least one document to upload.']);
        }

        $targets = $request->input('occupantTargets') ?? [];
        if (is_string($targets)) {
            $decoded = json_decode($targets, true);
            $targets = is_array($decoded) ? $decoded : [];
        }

        return $this->service->uploadDocumentsForStay($hotelId, $stayId, $normalized, (array) $targets);
    }

    /** Uploads a document to a specific occupant */
    public function uploadToOccupant(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $occupantId = (int) $request->routeParams['id'];

        $fileInput = $request->file('document') ?? $request->file('file') ?? $_FILES['document'] ?? $_FILES['file'] ?? null;
        $normalized = OccupantDocumentUploader::normalizeFiles($fileInput);

        if (empty($normalized)) {
            throw ApiException::validation(['document' => 'Please select a document to upload.']);
        }

        return $this->service->uploadDocumentForOccupant($hotelId, $occupantId, $normalized[0]);
    }

    /** Streams document file directly with hotel-level validation */
    public function download(Request $request): ?array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $docId = (int) $request->routeParams['id'];

        $info = $this->service->getDocumentFilePath($hotelId, $docId);

        $filename = preg_replace('/[^a-zA-Z0-9_\.-]/', '_', (string) $info['filename']);
        header('Content-Type: ' . $info['mime_type']);
        header('Content-Length: ' . (string) $info['size']);
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Cache-Control: private, max-age=0, no-store');
        readfile($info['path']);
        return null;
    }

    /** Deletes an uploaded document */
    public function delete(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $docId = (int) $request->routeParams['id'];

        $deleted = $this->service->deleteDocument($hotelId, $docId);
        return ['deleted' => $deleted];
    }
}
