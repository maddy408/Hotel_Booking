<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Validates and stores a guest's ID proof image outside the public webroot
 * (backend/storage/uploads/guests/) so it's only reachable through the
 * authenticated, role-checked download endpoint — never a direct static URL.
 */
final class IdImageUploader
{
    public const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
    public const ALLOWED_MIME = [
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    public function __construct(private readonly string $storageDir)
    {
    }

    /**
     * @param array{tmp_name:string, size:int, error:int, name:string} $file one entry from $_FILES
     * @return string relative path stored in guests.id_image_path (relative to $storageDir)
     */
    public function store(int $guestId, array $file): string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw ApiException::validation(['image' => 'The upload failed. Try again.']);
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            throw ApiException::validation(['image' => 'Invalid upload.']);
        }
        if ($file['size'] <= 0 || $file['size'] > self::MAX_BYTES) {
            throw ApiException::validation(['image' => 'Document must be 10 MB or smaller.']);
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($file['tmp_name']);
        if (!isset(self::ALLOWED_MIME[$mime])) {
            $mime = (string) @mime_content_type($file['tmp_name']);
        }
        if (!isset(self::ALLOWED_MIME[$mime])) {
            throw ApiException::validation(['image' => 'Only PDF, JPEG, PNG, or WEBP documents are allowed.']);
        }

        $dir = rtrim($this->storageDir, '/\\') . '/guests';
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException("Could not create upload directory: {$dir}");
        }

        $filename = $guestId . '-' . bin2hex(random_bytes(8)) . '.' . self::ALLOWED_MIME[$mime];
        $destination = $dir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            throw new \RuntimeException('Could not save the uploaded document.');
        }

        return 'guests/' . $filename;
    }

    public function absolutePath(string $relativePath): string
    {
        return rtrim($this->storageDir, '/\\') . '/' . ltrim($relativePath, '/\\');
    }

    public function mimeFor(string $absolutePath): string
    {
        return (string) mime_content_type($absolutePath) ?: 'application/octet-stream';
    }

    public function delete(string $relativePath): void
    {
        $path = $this->absolutePath($relativePath);
        if (is_file($path)) {
            @unlink($path);
        }
    }
}
