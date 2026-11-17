<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
use App\Repository\ReservationRepository;
use App\Repository\StayRepository;
use App\Support\ApiException;
use App\Support\OccupantDocumentUploader;

final class OccupantDocumentService
{
    public function __construct(
        private readonly OccupantRepository $occupants,
        private readonly OccupantDocumentRepository $documents,
        private readonly StayRepository $stays,
        private readonly OccupantDocumentUploader $uploader,
        private readonly ?ReservationRepository $reservations = null,
    ) {
    }

    /**
     * Creates occupant records for a stay based on actual persons count.
     * Primary guest is linked to occupant #1.
     *
     * @param array<int, array{name?:string, gender?:string, phone?:string}> $occupantsData
     * @return array<int, array<string, mixed>> list of created occupant rows
     */
    public function syncOccupantsForStay(
        int $hotelId,
        int $stayId,
        int $actualPersons,
        ?int $primaryGuestId = null,
        ?string $primaryGuestName = null,
        array $occupantsData = [],
    ): array {
        $actualPersons = max(1, $actualPersons);
        $existing = $this->occupants->findByStay($stayId, $hotelId);

        if (!empty($existing)) {
            $this->occupants->deleteByStay($stayId);
        }

        $created = [];
        for ($i = 1; $i <= $actualPersons; $i++) {
            $isPrimary = ($i === 1);
            $occInput = $occupantsData[$i - 1] ?? [];
            $name = isset($occInput['name']) && trim((string) $occInput['name']) !== ''
                ? trim((string) $occInput['name'])
                : ($isPrimary ? ($primaryGuestName !== null && trim($primaryGuestName) !== '' ? trim($primaryGuestName) : null) : null);
            $gender = isset($occInput['gender']) && trim((string) $occInput['gender']) !== ''
                ? trim((string) $occInput['gender'])
                : null;
            $phone = isset($occInput['phone']) && trim((string) $occInput['phone']) !== ''
                ? trim((string) $occInput['phone'])
                : null;
            $guestId = $isPrimary ? $primaryGuestId : null;

            $occId = $this->occupants->create(
                $hotelId,
                $stayId,
                $i,
                $name,
                $isPrimary,
                $guestId,
                $gender,
                $phone,
            );

            $created[] = [
                'id' => $occId,
                'hotel_id' => $hotelId,
                'stay_id' => $stayId,
                'occupant_number' => $i,
                'name' => $name,
                'gender' => $gender,
                'phone' => $phone,
                'is_primary' => $isPrimary ? 1 : 0,
                'guest_id' => $guestId,
            ];
        }

        return $created;
    }

    /**
     * Uploads and associates multiple ID documents with occupants of a stay.
     * By default associates documents with the relevant stay without assigning
     * to individual occupants unless explicitly targeted.
     *
     * @param array<int, array{tmp_name:string, name:string, size:int, error:int}> $files
     * @param array<int, int|string|null> $occupantTargetIndexes map of fileIndex => occupantIndex (0-based) or occupantId
     * @return array<int, array<string, mixed>>
     */
    public function uploadDocumentsForStay(
        int $hotelId,
        int $stayId,
        array $files,
        array $occupantTargetIndexes = [],
        ?int $reservationId = null,
    ): array {
        if (empty($files)) {
            return [];
        }

        $stay = $this->stays->find($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }

        $actualReservationId = $reservationId ?? (isset($stay['reservation_id']) && $stay['reservation_id'] !== null ? (int) $stay['reservation_id'] : null);

        $occupantsList = $this->occupants->findByStay($stayId, $hotelId);
        if (empty($occupantsList)) {
            $personsCount = (int) ($stay['persons'] ?? 1);
            $occupantsList = $this->syncOccupantsForStay(
                $hotelId,
                $stayId,
                $personsCount,
                (int) $stay['guest_id'],
                null
            );
        }

        $numOccupants = count($occupantsList);
        $savedDocuments = [];
        $storedFilePaths = [];

        try {
            foreach ($files as $idx => $file) {
                // Determine if an occupant was explicitly selected
                $targetOccupantId = null;
                $targetVal = $occupantTargetIndexes[$idx] ?? (array_values($occupantTargetIndexes)[$idx] ?? null);

                if ($targetVal !== '' && $targetVal !== null && $targetVal !== 'null') {
                    $val = (int) $targetVal;
                    // Could be 0-based occupant index or direct occupant_id
                    if ($val >= 0 && $val < $numOccupants && isset($occupantsList[$val])) {
                        $targetOccupantId = (int) $occupantsList[$val]['id'];
                    } else {
                        foreach ($occupantsList as $occ) {
                            if ((int) $occ['id'] === $val) {
                                $targetOccupantId = $val;
                                break;
                            }
                        }
                    }
                } elseif ($numOccupants === 1 && isset($occupantsList[0])) {
                    // Default to occupant 1 if single person stay
                    $targetOccupantId = (int) $occupantsList[0]['id'];
                }

                // Associate document with the stay; if explicitly assigned, associate with occupant
                $prefix = $targetOccupantId !== null ? 'occ_' . $targetOccupantId : 'stay_' . $stayId;
                $stored = $this->uploader->storeDocument($prefix, $file);
                $storedFilePaths[] = $stored['file_path'];

                $docId = $this->documents->create(
                    $hotelId,
                    $targetOccupantId,
                    $stored['file_path'],
                    $stored['original_filename'],
                    $stored['mime_type'],
                    $stored['file_size'],
                    reservationId: $actualReservationId,
                    stayId: $stayId,
                );

                $savedDocuments[] = [
                    'id' => $docId,
                    'hotel_id' => $hotelId,
                    'reservation_id' => $actualReservationId,
                    'stay_id' => $stayId,
                    'occupant_id' => $targetOccupantId,
                    'file_path' => $stored['file_path'],
                    'original_filename' => $stored['original_filename'],
                    'mime_type' => $stored['mime_type'],
                    'file_size' => $stored['file_size'],
                    'uploaded_at' => date('Y-m-d H:i:s'),
                ];
            }
        } catch (\Throwable $e) {
            // Cleanup any files written to disk if anything fails
            foreach ($storedFilePaths as $fp) {
                $this->uploader->delete($fp);
            }
            throw $e;
        }

        return $savedDocuments;
    }

    /**
     * Uploads and associates multiple ID documents with a reservation (Pre-Booking).
     *
     * @param array<int, array{tmp_name:string, name:string, size:int, error:int}> $files
     * @return array<int, array<string, mixed>>
     */
    public function uploadDocumentsForReservation(
        int $hotelId,
        int $reservationId,
        array $files,
    ): array {
        if (empty($files)) {
            return [];
        }

        if ($this->reservations !== null) {
            $reservation = $this->reservations->find($reservationId);
            if ($reservation === null || (int) $reservation['hotel_id'] !== $hotelId) {
                throw ApiException::notFound('Booking not found.');
            }
        }

        $savedDocuments = [];
        $storedFilePaths = [];

        try {
            foreach ($files as $file) {
                $stored = $this->uploader->storeDocument('res_' . $reservationId, $file);
                $storedFilePaths[] = $stored['file_path'];

                $docId = $this->documents->create(
                    $hotelId,
                    null,
                    $stored['file_path'],
                    $stored['original_filename'],
                    $stored['mime_type'],
                    $stored['file_size'],
                    reservationId: $reservationId,
                    stayId: null,
                );

                $savedDocuments[] = [
                    'id' => $docId,
                    'hotel_id' => $hotelId,
                    'reservation_id' => $reservationId,
                    'stay_id' => null,
                    'occupant_id' => null,
                    'file_path' => $stored['file_path'],
                    'original_filename' => $stored['original_filename'],
                    'mime_type' => $stored['mime_type'],
                    'file_size' => $stored['file_size'],
                    'uploaded_at' => date('Y-m-d H:i:s'),
                ];
            }
        } catch (\Throwable $e) {
            foreach ($storedFilePaths as $fp) {
                $this->uploader->delete($fp);
            }
            throw $e;
        }

        return $savedDocuments;
    }

    /**
     * Assigns existing pre-booking documents to specific occupants of a stay.
     *
     * @param array<int|string, int|string> $assignments map of documentId => occupantIndex (0-based) or occupantId
     * @param array<int, array<string, mixed>> $occupantsList
     */
    public function assignPreBookingDocuments(int $hotelId, int $stayId, array $assignments, array $occupantsList): void
    {
        if (empty($assignments) || empty($occupantsList)) {
            return;
        }
        $numOccupants = count($occupantsList);
        foreach ($assignments as $docId => $targetIndex) {
            if ($targetIndex === '' || $targetIndex === null || $targetIndex === 'null') {
                continue;
            }
            $targetOccupantId = null;
            $val = (int) $targetIndex;
            if ($val >= 0 && $val < $numOccupants && isset($occupantsList[$val])) {
                $targetOccupantId = (int) $occupantsList[$val]['id'];
            } else {
                foreach ($occupantsList as $occ) {
                    if ((int) $occ['id'] === $val) {
                        $targetOccupantId = $val;
                        break;
                    }
                }
            }
            if ($targetOccupantId !== null) {
                $this->documents->assignDocumentToOccupant((int) $docId, $targetOccupantId, $hotelId, $stayId);
            }
        }
    }

    /**
     * Links existing pre-booking documents to a stay upon check-in without duplicating files.
     */
    public function linkReservationDocumentsToStay(int $hotelId, int $reservationId, int $stayId): int
    {
        return $this->documents->attachReservationDocumentsToStay($reservationId, $stayId, $hotelId);
    }

    /** @return array<int, array<string, mixed>> */
    public function getDocumentsForReservation(int $hotelId, int $reservationId): array
    {
        return $this->documents->findByReservation($reservationId, $hotelId);
    }

    /** @return array<int, array<string, mixed>> */
    public function getDocumentsForGuest(int $hotelId, int $guestId): array
    {
        return $this->documents->findByGuest($guestId, $hotelId);
    }

    /**
     * Uploads a document directly for a specific occupant.
     */
    public function uploadDocumentForOccupant(
        int $hotelId,
        int $occupantId,
        array $file,
    ): array {
        $occupant = $this->occupants->findById($occupantId, $hotelId);
        if ($occupant === null) {
            throw ApiException::notFound('Occupant not found.');
        }

        $stored = $this->uploader->store($occupantId, $file);
        try {
            $docId = $this->documents->create(
                $hotelId,
                $occupantId,
                $stored['file_path'],
                $stored['original_filename'],
                $stored['mime_type'],
                $stored['file_size'],
            );
        } catch (\Throwable $e) {
            $this->uploader->delete($stored['file_path']);
            throw $e;
        }

        return [
            'id' => $docId,
            'hotel_id' => $hotelId,
            'occupant_id' => $occupantId,
            'file_path' => $stored['file_path'],
            'original_filename' => $stored['original_filename'],
            'mime_type' => $stored['mime_type'],
            'file_size' => $stored['file_size'],
            'uploaded_at' => date('Y-m-d H:i:s'),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    public function getDocumentsForStay(int $hotelId, int $stayId): array
    {
        $stay = $this->stays->find($stayId);
        if ($stay === null || (int) $stay['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Stay not found.');
        }

        return $this->documents->findByStay($stayId, $hotelId);
    }

    /**
     * Returns occupants and their attached documents for a stay.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getOccupantsWithDocumentsForStay(int $hotelId, int $stayId): array
    {
        $occupantsList = $this->occupants->findByStay($stayId, $hotelId);
        $docsList = $this->documents->findByStay($stayId, $hotelId);

        $docsByOccupant = [];
        foreach ($docsList as $doc) {
            $occId = (int) $doc['occupant_id'];
            $docsByOccupant[$occId][] = $doc;
        }

        foreach ($occupantsList as &$occ) {
            $occ['documents'] = $docsByOccupant[(int) $occ['id']] ?? [];
        }
        unset($occ);

        return $occupantsList;
    }

    /**
     * Resolves the absolute file path for a document with hotel-level isolation check.
     */
    public function getDocumentFilePath(int $hotelId, int $docId): array
    {
        $doc = $this->documents->findById($docId, $hotelId);
        if ($doc === null || (int) $doc['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Document not found.');
        }

        $absPath = $this->uploader->absolutePath($doc['file_path']);
        if (!file_exists($absPath)) {
            throw ApiException::notFound('Document file is missing on server.');
        }

        return [
            'document' => $doc,
            'path' => $absPath,
            'mime_type' => $doc['mime_type'],
            'filename' => $doc['original_filename'],
            'size' => (int) $doc['file_size'],
        ];
    }

    public function deletePhysicalFile(string $filePath): void
    {
        $this->uploader->delete($filePath);
    }

    public function deleteDocument(int $hotelId, int $docId): bool
    {
        $doc = $this->documents->findById($docId, $hotelId);
        if ($doc === null || (int) $doc['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Document not found.');
        }

        $this->uploader->delete($doc['file_path']);
        return $this->documents->delete($docId, $hotelId);
    }
}
