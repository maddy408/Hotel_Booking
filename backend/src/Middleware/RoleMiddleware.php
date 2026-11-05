<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Router\Request;
use App\Support\ApiException;

/**
 * Usage: new RoleMiddleware(['admin','manager']) as a route middleware,
 * applied *after* AuthMiddleware so request->attribute('role') is set.
 */
final class RoleMiddleware
{
    /** @param string[] $allowedRoles */
    public function __construct(private readonly array $allowedRoles)
    {
    }

    public function __invoke(Request $request): void
    {
        $role = $request->attribute('role');
        if ($role === null || !in_array($role, $this->allowedRoles, true)) {
            throw ApiException::forbidden('You do not have permission to do this.');
        }
    }
}
