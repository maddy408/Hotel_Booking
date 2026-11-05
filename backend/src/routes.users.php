<?php

declare(strict_types=1);

use App\Controller\UserController;
use App\Middleware\RoleMiddleware;
use App\Repository\AuditLogRepository;
use App\Repository\RoleRepository;
use App\Repository\UserRepository;
use App\Router\Router;
use App\Service\UserService;
use App\Support\AuditLogger;

return static function (Router $router, PDO $db, callable $auth): void {
    $adminOnly = new RoleMiddleware(['admin']);
    $controller = new UserController(new UserService(new UserRepository($db), new RoleRepository($db), new AuditLogger(new AuditLogRepository($db))));

    $router->get('/users', [$controller, 'index'], [$auth, $adminOnly]);
    $router->get('/roles', [$controller, 'roles'], [$auth, $adminOnly]);
    $router->post('/users', [$controller, 'create'], [$auth, $adminOnly]);
    $router->put('/users/{id}', [$controller, 'update'], [$auth, $adminOnly]);
    $router->post('/users/{id}/reset-password', [$controller, 'resetPassword'], [$auth, $adminOnly]);
};
