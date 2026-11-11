<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;

final class Cors
{
    public static function handle(): void
    {
        $allowedConfig = (string) Env::get('CORS_ALLOWED_ORIGINS', '');
        $allowed = array_filter(array_map('trim', explode(',', $allowedConfig)));
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origin !== '' && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Max-Age: 86400');

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
