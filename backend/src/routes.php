<?php

declare(strict_types=1);

use App\Controller\AuthController;
use App\Middleware\AuthMiddleware;
use App\Repository\LoginAttemptRepository;
use App\Repository\RefreshTokenRepository;
use App\Repository\UserRepository;
use App\Router\Request;
use App\Router\Router;
use App\Service\AuthService;


/**
 * Registers every API route. Kept as one file (vs. a full DI container) to match
 * the brief's "no heavy framework" constraint — each phase appends its own section.
 */
return static function (Router $router, PDO $db): void {
    $auth = new AuthMiddleware();

    // ---- health ----
    $router->get('/health', static fn (Request $r) => ['status' => 'ok', 'time' => date('c')]);

    // ---- auth ----
    $authController = new AuthController(new AuthService(
        new UserRepository($db),
        new RefreshTokenRepository($db),
        new LoginAttemptRepository($db),
    ));
    $router->post('/auth/login', [$authController, 'login']);
    $router->post('/auth/refresh', [$authController, 'refresh']);
    $router->post('/auth/logout', [$authController, 'logout']);
    $router->get('/auth/me', [$authController, 'me'], [$auth]);

    // Phase 3+ routes (rooms, bookings, guests, billing, reports, settings, users) are
    // appended below as each phase lands.
    (require __DIR__ . '/routes.rooms.php')($router, $db, $auth);
    (require __DIR__ . '/routes.booking.php')($router, $db, $auth);
    (require __DIR__ . '/routes.reports.php')($router, $db, $auth);
    (require __DIR__ . '/routes.users.php')($router, $db, $auth);
};
