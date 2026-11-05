<?php

declare(strict_types=1);

namespace App\Support;

final class Response
{
    public static function success(mixed $data = null, int $status = 200): void
    {
        self::send($status, ['success' => true, 'data' => $data, 'error' => null]);
    }

    /** @param array<string,string>|null $fields */
    public static function error(string $message, int $status = 400, string $code = 'bad_request', ?array $fields = null): void
    {
        self::send($status, [
            'success' => false,
            'data' => null,
            'error' => array_filter([
                'code' => $code,
                'message' => $message,
                'fields' => $fields,
            ], static fn ($v) => $v !== null),
        ]);
    }

    private static function send(int $status, array $payload): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
}
