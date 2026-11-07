<?php

declare(strict_types=1);

use App\Controller\RoomController;
use App\Controller\RoomTypeController;
use App\Controller\SettingsController;
use App\Middleware\RoleMiddleware;
use App\Repository\AuditLogRepository;
use App\Repository\HotelRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Repository\SettingsRepository;
use App\Router\Router;
use App\Service\RoomService;
use App\Support\AuditLogger;

return static function (Router $router, PDO $db, callable $auth): void {
    $staffOnly = new RoleMiddleware(['admin', 'manager']);
    $adminOnly = new RoleMiddleware(['admin']);

    $roomService = new RoomService(
        new RoomRepository($db),
        new RoomTypeRepository($db),
        new HousekeepingLogRepository($db),
        new AuditLogger(new AuditLogRepository($db)),
    );

    $roomTypeController = new RoomTypeController($roomService, new RoomTypeRepository($db));
    $router->get('/room-types', [$roomTypeController, 'index'], [$auth]);
    $router->post('/room-types', [$roomTypeController, 'create'], [$auth, $staffOnly]);
    $router->put('/room-types/{id}', [$roomTypeController, 'update'], [$auth, $staffOnly]);
    $router->delete('/room-types/{id}', [$roomTypeController, 'delete'], [$auth, $staffOnly]);

    $roomController = new RoomController($roomService);
    $router->get('/rooms', [$roomController, 'index'], [$auth]);
    $router->post('/rooms/bulk', [$roomController, 'bulkAdd'], [$auth, $staffOnly]);
    $router->put('/rooms/{id}', [$roomController, 'update'], [$auth, $staffOnly]);
    $router->put('/rooms/{id}/type', [$roomController, 'changeType'], [$auth, $staffOnly]);
    $router->delete('/rooms/{id}', [$roomController, 'delete'], [$auth, $staffOnly]);
    $router->post('/rooms/{id}/housekeeping', [$roomController, 'housekeeping'], [$auth]);

    $settingsController = new SettingsController(new HotelRepository($db), new SettingsRepository($db));
    $router->get('/settings', [$settingsController, 'show'], [$auth]);
    $router->put('/settings/hotel', [$settingsController, 'updateHotel'], [$auth, $adminOnly]);
    $router->put('/settings/gst', [$settingsController, 'updateGst'], [$auth, $adminOnly]);
    $router->put('/settings/whatsapp', [$settingsController, 'updateWhatsapp'], [$auth, $adminOnly]);
    $router->put('/settings/policies', [$settingsController, 'updatePolicies'], [$auth, $adminOnly]);
};
