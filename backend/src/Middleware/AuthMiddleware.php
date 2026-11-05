<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Router\Request;
use App\Support\ApiException;
use App\Support\Jwt;

final class AuthMiddleware
{
    public function __invoke(Request $request): void
    {
        $token = $request->bearerToken();
        if ($token === null) {
            throw ApiException::unauthorized('Login required.');
        }
        $claims = Jwt::decode($token);
        if (($claims['type'] ?? null) !== 'access') {
            throw ApiException::unauthorized('Invalid token.');
        }
        $request->setAttribute('userId', (int) $claims['sub']);
        $request->setAttribute('role', (string) $claims['role']);
        $request->setAttribute('hotelId', (int) $claims['hotel_id']);
    }
}
