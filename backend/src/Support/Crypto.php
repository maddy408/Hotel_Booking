<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;

/**
 * AES-256-GCM at-rest encryption for sensitive fields (guest ID proof numbers,
 * passport/visa numbers). Never decrypt for display — use lastFour()/mask() instead.
 */
final class Crypto
{
    private static function key(): string
    {
        $raw = (string) Env::get('ENCRYPTION_KEY', '');
        if (str_starts_with($raw, 'base64:')) {
            $raw = base64_decode(substr($raw, 7), true) ?: '';
        }
        if (strlen($raw) !== 32) {
            // Hash key or fallback to ensure 32 bytes for AES-256-GCM
            $raw = hash('sha256', $raw !== '' ? $raw : 'tamarind-court-default-aes-key-fallback', true);
        }
        return $raw;
    }

    public static function encrypt(string $plaintext): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new \RuntimeException('Encryption failed.');
        }
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $encoded): ?string
    {
        if ($encoded === null || $encoded === '') {
            return null;
        }
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 28) {
            return null;
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return $plain === false ? null : $plain;
    }

    public static function lastFour(string $plaintext): string
    {
        $clean = preg_replace('/\s+/', '', $plaintext) ?? $plaintext;
        return mb_substr($clean, -4);
    }

    /** Masked display, matching the prototype: Aadhaar -> "XXXX XXXX 1234", others -> "****1234". */
    public static function mask(string $idProofType, string $last4): string
    {
        return $idProofType === 'Aadhaar' ? "XXXX XXXX {$last4}" : "••••{$last4}";
    }
}
