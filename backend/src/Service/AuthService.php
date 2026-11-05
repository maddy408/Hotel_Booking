<?php

declare(strict_types=1);

namespace App\Service;

use App\Config\Env;
use App\Repository\LoginAttemptRepository;
use App\Repository\RefreshTokenRepository;
use App\Repository\UserRepository;
use App\Support\ApiException;
use App\Support\Jwt;

final class AuthService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly RefreshTokenRepository $refreshTokens,
        private readonly LoginAttemptRepository $attempts,
    ) {
    }

    /** @return array{user:array<string,mixed>, accessToken:string, refreshToken:string} */
    public function login(string $username, string $password, string $ip): array
    {
        $maxAttempts = Env::int('LOGIN_MAX_ATTEMPTS', 5);
        $lockoutSeconds = Env::int('LOGIN_LOCKOUT_SECONDS', 900);

        if ($this->attempts->recentFailureCount($username, $ip, $lockoutSeconds) >= $maxAttempts) {
            throw ApiException::tooManyRequests('Too many failed attempts. Try again later.');
        }

        $user = $this->users->findByUsername($username);
        $valid = $user !== null && (int) $user['is_active'] === 1 && password_verify($password, $user['password_hash']);

        $this->attempts->record($username, $ip, $valid);

        if (!$valid) {
            throw ApiException::unauthorized('Incorrect username or password.');
        }

        $this->users->touchLastLogin((int) $user['id']);

        $accessToken = Jwt::issueAccessToken((int) $user['id'], $user['role_code'], (int) $user['hotel_id'], [
            'name' => $user['name'],
        ]);
        $refresh = Jwt::issueRefreshToken((int) $user['id']);
        $this->refreshTokens->store((int) $user['id'], Jwt::hash($refresh['token']), $refresh['expiresAt']);

        return [
            'user' => $this->publicUser($user),
            'accessToken' => $accessToken,
            'refreshToken' => $refresh['token'],
        ];
    }

    /** @return array{accessToken:string, refreshToken:string} */
    public function refresh(string $refreshToken): array
    {
        $claims = Jwt::decode($refreshToken);
        if (($claims['type'] ?? null) !== 'refresh') {
            throw ApiException::unauthorized('Invalid refresh token.');
        }
        $hash = Jwt::hash($refreshToken);
        $stored = $this->refreshTokens->findValid($hash);
        if ($stored === null) {
            throw ApiException::unauthorized('Refresh token expired or revoked. Please log in again.');
        }

        $user = $this->users->findById((int) $claims['sub']);
        if ($user === null || (int) $user['is_active'] !== 1) {
            throw ApiException::unauthorized('Account not found or disabled.');
        }

        // Rotate: revoke the used refresh token, issue a new pair.
        $this->refreshTokens->revoke($hash);
        $accessToken = Jwt::issueAccessToken((int) $user['id'], $user['role_code'], (int) $user['hotel_id'], [
            'name' => $user['name'],
        ]);
        $newRefresh = Jwt::issueRefreshToken((int) $user['id']);
        $this->refreshTokens->store((int) $user['id'], Jwt::hash($newRefresh['token']), $newRefresh['expiresAt']);

        return ['accessToken' => $accessToken, 'refreshToken' => $newRefresh['token']];
    }

    public function logout(string $refreshToken): void
    {
        $this->refreshTokens->revoke(Jwt::hash($refreshToken));
    }

    public function currentUser(int $userId): array
    {
        $user = $this->users->findById($userId);
        if ($user === null) {
            throw ApiException::notFound('User not found.');
        }
        return $this->publicUser($user);
    }

    /** @param array<string,mixed> $user */
    private function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'hotelId' => (int) $user['hotel_id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'email' => $user['email'] ?? null,
            'phone' => $user['phone'] ?? null,
            'role' => $user['role_code'],
            'roleName' => $user['role_name'],
        ];
    }
}
