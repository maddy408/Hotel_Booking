<?php

declare(strict_types=1);

namespace App\Service;

use App\Repository\GuestRepository;
use App\Support\ApiException;
use App\Support\Crypto;
use App\Support\IdImageUploader;

/**
 * Finds a guest by phone (matching the prototype's auto-fill-on-phone-match behaviour)
 * or creates one, with the full ID proof number encrypted at rest.
 */
class GuestService
{
    public function __construct(
        private readonly GuestRepository $guests,
        private readonly ?IdImageUploader $uploader = null,
    ) {
    }

    /** @param array{tmp_name:string, size:int, error:int, name:string} $file */
    public function uploadIdImage(int $hotelId, int $guestId, array $file): array
    {
        $guest = $this->guests->find($guestId);
        if ($guest === null || (int) $guest['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Guest not found.');
        }
        if ($this->uploader === null) {
            throw new \RuntimeException('ID image uploads are not configured.');
        }
        $path = $this->uploader->store($guestId, $file);
        $this->guests->update($guestId, ['id_image_path' => $path]);
        return $this->guests->find($guestId);
    }

    /** @return string absolute filesystem path, after confirming the guest belongs to this hotel */
    public function idImagePath(int $hotelId, int $guestId): string
    {
        $guest = $this->guests->find($guestId);
        if ($guest === null || (int) $guest['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Guest not found.');
        }
        if (empty($guest['id_image_path']) || $this->uploader === null) {
            throw ApiException::notFound('No ID image on file for this guest.');
        }
        $path = $this->uploader->absolutePath($guest['id_image_path']);
        if (!is_file($path)) {
            throw ApiException::notFound('No ID image on file for this guest.');
        }
        return $path;
    }

    public function findByPhone(int $hotelId, string $phone): ?array
    {
        return $this->guests->findByPhone($hotelId, $this->normalizePhone($phone));
    }

    /**
     * @param string|null $idProofNumber Full number; required when creating a new guest, optional when updating one.
     */
    public function findOrCreate(
        int $hotelId,
        string $phone,
        string $name,
        string $idProofType,
        ?string $idProofNumber,
        ?string $city,
    ): array {
        $phone = $this->normalizePhone($phone);
        $existing = $this->guests->findByPhone($hotelId, $phone);

        if ($existing !== null) {
            $fields = ['name' => $name, 'id_proof_type' => $idProofType, 'city' => $city];
            if ($idProofNumber !== null && trim($idProofNumber) !== '') {
                $fields['id_proof_number_enc'] = Crypto::encrypt($idProofNumber);
                $fields['id_proof_last4'] = Crypto::lastFour($idProofNumber);
            }
            $this->guests->update((int) $existing['id'], $fields);
            return $this->guests->find((int) $existing['id']);
        }

        if ($idProofNumber === null || mb_strlen(preg_replace('/\s+/', '', $idProofNumber) ?? '') < 4) {
            throw ApiException::validation(['idProofNumber' => 'Enter ID number.']);
        }

        $id = $this->guests->create(
            $hotelId,
            $name,
            $phone,
            $idProofType,
            Crypto::encrypt($idProofNumber),
            Crypto::lastFour($idProofNumber),
            $city,
        );
        return $this->guests->find($id);
    }

    /**
     * Updates an existing guest profile.
     */
    public function update(int $hotelId, int $guestId, array $data): array
    {
        $guest = $this->guests->find($guestId);
        if ($guest === null || (int) $guest['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Guest not found.');
        }

        $fields = [];
        if (isset($data['name'])) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                throw ApiException::validation(['name' => 'Name cannot be empty.']);
            }
            $fields['name'] = $name;
        }

        if (isset($data['phone'])) {
            $phone = $this->normalizePhone((string) $data['phone']);
            $byPhone = $this->guests->findByPhone($hotelId, $phone);
            if ($byPhone !== null && (int) $byPhone['id'] !== $guestId) {
                throw ApiException::conflict('Another guest already exists with this phone number.');
            }
            $fields['phone'] = $phone;
        }

        if (array_key_exists('city', $data)) {
            $fields['city'] = $data['city'] !== null ? trim((string) $data['city']) : null;
        }

        if (isset($data['idProofType'])) {
            $fields['id_proof_type'] = (string) $data['idProofType'];
        }

        if (!empty($data['idProofNumber'])) {
            $num = trim((string) $data['idProofNumber']);
            if (mb_strlen(preg_replace('/\s+/', '', $num) ?? '') < 4) {
                throw ApiException::validation(['idProofNumber' => 'Enter a valid ID number (at least 4 characters).']);
            }
            $fields['id_proof_number_enc'] = Crypto::encrypt($num);
            $fields['id_proof_last4'] = Crypto::lastFour($num);
        }

        if ($fields !== []) {
            $this->guests->update($guestId, $fields);
        }

        return $this->guests->find($guestId);
    }

    /**
     * For a booking taken over the phone: no ID proof is collected yet (it's captured
     * at actual check-in), so a brand-new guest is created with just name/phone/city.
     */
    public function findOrCreateMinimal(int $hotelId, string $phone, string $name, ?string $city = null): array
    {
        $name = trim($name);
        if ($name === '') {
            throw ApiException::validation(['name' => 'Guest name cannot be empty.'], 'Guest name cannot be empty.');
        }
        $phone = $this->normalizePhone($phone);
        $existing = $this->guests->findByPhone($hotelId, $phone);
        if ($existing !== null) {
            $this->guests->update((int) $existing['id'], ['name' => $name]);
            return $this->guests->find((int) $existing['id']);
        }
        $id = $this->guests->create($hotelId, $name, $phone, 'Aadhaar', null, null, $city);
        return $this->guests->find($id);
    }

    /** Masked view safe to send to the frontend — never the decrypted number. */
    public function toPublic(array $guest): array
    {
        return [
            'id' => (int) $guest['id'],
            'name' => $guest['name'],
            'phone' => $guest['phone'],
            'idProofType' => $guest['id_proof_type'],
            'idProofMasked' => $guest['id_proof_last4'] ? Crypto::mask($guest['id_proof_type'], $guest['id_proof_last4']) : null,
            'city' => $guest['city'],
            'isForeign' => (bool) $guest['is_foreign'],
            'nationality' => $guest['nationality'] ?? null,
            'visaExpiry' => $guest['visa_expiry'] ?? null,
            'hasIdImage' => !empty($guest['id_image_path']),
        ];
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (strlen($digits) !== 10) {
            throw ApiException::validation(['phone' => 'Enter a 10-digit mobile number.']);
        }
        return $digits;
    }
}
