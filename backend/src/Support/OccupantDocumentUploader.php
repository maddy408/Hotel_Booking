<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Validates and stores occupant ID proof documents outside the public webroot
 * (backend/storage/uploads/occupants/) so they are only reachable through
 * authenticated, hotel-scoped endpoints — never via direct static URLs.
 */
final class OccupantDocumentUploader
{
    public const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
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
     * @param array{tmp_name:string, size:int, error:int, name:string, type?:string} $file
     * @return array{file_path:string, original_filename:string, mime_type:string, file_size:int}
     */
    public function store(int $occupantId, array $file): array
    {
        return $this->storeDocument('occ_' . $occupantId, $file);
    }

    /**
     * Stores a document with an arbitrary safe prefix (e.g. res_123, stay_456, occ_789).
     *
     * @param array{tmp_name:string, size:int, error:int, name:string, type?:string} $file
     * @return array{file_path:string, original_filename:string, mime_type:string, file_size:int}
     */
    public function storeDocument(string $prefix, array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw ApiException::validation(['documents' => 'Document upload failed. Please try again.']);
        }
        $tmp = $file['tmp_name'] ?? '';
        if ($tmp === '' || !file_exists($tmp)) {
            throw ApiException::validation(['documents' => 'Uploaded file is missing or invalid.']);
        }

        $size = (int) ($file['size'] ?? filesize($tmp));
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw ApiException::validation(['documents' => 'Document must be 10 MB or smaller.']);
        }

        // Validate MIME type safely
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = (string) $finfo->file($tmp);
        if (!isset(self::ALLOWED_MIME[$detectedMime])) {
            // Also fallback to mime_content_type if available
            $detectedMime = (string) @mime_content_type($tmp);
        }

        if (!isset(self::ALLOWED_MIME[$detectedMime])) {
            throw ApiException::validation([
                'documents' => 'Only PDF, JPG, PNG, and WEBP documents are allowed. Detected: ' . htmlspecialchars($detectedMime),
            ]);
        }

        $originalName = (string) ($file['name'] ?? 'document.' . self::ALLOWED_MIME[$detectedMime]);
        $origExt = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $expectedExt = self::ALLOWED_MIME[$detectedMime];
        if ($expectedExt === 'jpg' && $origExt === 'jpeg') {
            $expectedExt = 'jpeg';
        }

        $dir = rtrim($this->storageDir, '/\\') . '/occupants';
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException("Could not create upload directory: {$dir}");
        }

        $cleanPrefix = preg_replace('/[^a-zA-Z0-9_-]/', '_', $prefix);
        $safeName = $cleanPrefix . '_' . bin2hex(random_bytes(8)) . '.' . $expectedExt;
        $destination = $dir . '/' . $safeName;

        if (is_uploaded_file($tmp)) {
            if (!move_uploaded_file($tmp, $destination)) {
                throw new \RuntimeException('Could not save uploaded document.');
            }
        } else {
            if (!copy($tmp, $destination)) {
                throw new \RuntimeException('Could not save document file.');
            }
        }

        return [
            'file_path' => 'occupants/' . $safeName,
            'original_filename' => basename($originalName),
            'mime_type' => $detectedMime,
            'file_size' => $size,
        ];
    }

    public function absolutePath(string $relativePath): string
    {
        return rtrim($this->storageDir, '/\\') . '/' . ltrim($relativePath, '/\\');
    }

    public function mimeFor(string $absolutePath): string
    {
        return (string) @mime_content_type($absolutePath) ?: 'application/octet-stream';
    }

    public function delete(string $relativePath): void
    {
        $path = $this->absolutePath($relativePath);
        if (file_exists($path)) {
            @unlink($path);
        }
    }

    /**
     * Normalizes PHP's $_FILES multi-file array into a flat list of file item arrays.
     * Handles:
     * 1. Single file: ['tmp_name' => '...', 'name' => '...', ...]
     * 2. Multiple files array: ['name' => ['a', 'b'], 'tmp_name' => ['...', '...'], ...]
     * 3. Array of file arrays: [['tmp_name' => '...'], ['tmp_name' => '...']]
     *
     * @return array<int, array{tmp_name:string, name:string, size:int, error:int, type?:string}>
     */
    public static function normalizeFiles(mixed $filesInput): array
    {
        if (empty($filesInput) || !is_array($filesInput)) {
            return [];
        }

        // Case 1: multiple files uploaded under input name like `documents[]`
        if (isset($filesInput['name']) && is_array($filesInput['name'])) {
            $normalized = [];
            $count = count($filesInput['name']);
            for ($i = 0; $i < $count; $i++) {
                if (isset($filesInput['error'][$i]) && $filesInput['error'][$i] === UPLOAD_ERR_NO_FILE) {
                    continue;
                }
                $normalized[] = [
                    'name' => (string) ($filesInput['name'][$i] ?? ''),
                    'type' => (string) ($filesInput['type'][$i] ?? ''),
                    'tmp_name' => (string) ($filesInput['tmp_name'][$i] ?? ''),
                    'error' => (int) ($filesInput['error'][$i] ?? UPLOAD_ERR_OK),
                    'size' => (int) ($filesInput['size'][$i] ?? 0),
                ];
            }
            return $normalized;
        }

        // Case 2: single file entry: ['tmp_name' => '...', ...]
        if (isset($filesInput['tmp_name']) && is_string($filesInput['tmp_name'])) {
            if (($filesInput['error'] ?? UPLOAD_ERR_OK) === UPLOAD_ERR_NO_FILE) {
                return [];
            }
            return [$filesInput];
        }

        // Case 3: already an indexed array of files
        $normalized = [];
        foreach ($filesInput as $item) {
            if (is_array($item) && isset($item['tmp_name'])) {
                if (($item['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_NO_FILE) {
                    $normalized[] = $item;
                }
            }
        }
        return $normalized;
    }
}
