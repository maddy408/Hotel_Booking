<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\AuthService;
use App\Support\ApiException;
use App\Support\Validator;

final class AuthController
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public function login(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        return $this->auth->login((string) $data['username'], (string) $data['password'], $request->ip);
    }

    public function refresh(Request $request): array
    {
        $token = $request->input('refreshToken');
        if (!is_string($token) || $token === '') {
            throw ApiException::validation(['refreshToken' => 'Refresh token is required.']);
        }
        return $this->auth->refresh($token);
    }

    public function logout(Request $request): array
    {
        $token = $request->input('refreshToken');
        if (is_string($token) && $token !== '') {
            $this->auth->logout($token);
        }
        return ['loggedOut' => true];
    }

    public function me(Request $request): array
    {
        return $this->auth->currentUser((int) $request->attribute('userId'));
    }
}
