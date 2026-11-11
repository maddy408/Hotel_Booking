<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;

final class Cors
{
    public static function handle(): void
    {
        $allowedConfig = (string) Env::get('CORS_ALLOWED_ORIGINS', '*');
        if ($allowedConfig === '') {
            $allowedConfig = '*';
        }
        $allowed = array_filter(array_map('trim', explode(',', $allowedConfig)));
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($origin !== '') {
            if (in_array('*', $allowed, true) || in_array($origin, $allowed, true)) {
                header("Access-Control-Allow-Origin: {$origin}");
                header('Access-Control-Allow-Credentials: true');
                header('Vary: Origin');
            }
        } elseif (in_array('*', $allowed, true)) {
            header('Access-Control-Allow-Origin: *');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Max-Age: 86400');

        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
