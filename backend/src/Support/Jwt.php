<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;
use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;

final class Jwt
{
    private static function secret(): string
    {
        return (string) Env::get('JWT_SECRET');
    }

    /** @param array<string,mixed> $claims */
    public static function issueAccessToken(int $userId, string $role, int $hotelId, array $claims = []): string
    {
        $now = time();
        $ttl = Env::int('JWT_ACCESS_TTL_SECONDS', 900);
        $payload = array_merge($claims, [
            'sub' => $userId,
            'role' => $role,
            'hotel_id' => $hotelId,
            'type' => 'access',
            'iat' => $now,
            'exp' => $now + $ttl,
        ]);
        return FirebaseJwt::encode($payload, self::secret(), 'HS256');
    }

    /** @return array{token:string, expiresAt:int} */
    public static function issueRefreshToken(int $userId): array
    {
        $now = time();
        $ttl = Env::int('JWT_REFRESH_TTL_SECONDS', 1209600);
        $exp = $now + $ttl;
        $token = FirebaseJwt::encode([
            'sub' => $userId,
            'type' => 'refresh',
            'jti' => bin2hex(random_bytes(16)),
            'iat' => $now,
            'exp' => $exp,
        ], self::secret(), 'HS256');
        return ['token' => $token, 'expiresAt' => $exp];
    }

    /** @return array<string,mixed> */
    public static function decode(string $token): array
    {
        try {
            $decoded = FirebaseJwt::decode($token, new Key(self::secret(), 'HS256'));
            return (array) $decoded;
        } catch (\Throwable $e) {
            throw ApiException::unauthorized('Invalid or expired token.');
        }
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
