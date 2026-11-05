<?php

declare(strict_types=1);

use App\Controller\GuestController;
use App\Controller\ReservationController;
use App\Controller\StayController;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Router;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;

return static function (Router $router, PDO $db, callable $auth): void {
    $guestRepo = new GuestRepository($db);
    $guestService = new GuestService($guestRepo, new IdImageUploader(dirname(__DIR__) . '/storage/uploads'));
    $roomRepo = new RoomRepository($db);
    $reservationRepo = new ReservationRepository($db);
    $stayRepo = new StayRepository($db);
    $paymentRepo = new PaymentRepository($db);
    $settingsRepo = new SettingsRepository($db);
    $audit = new AuditLogger(new AuditLogRepository($db));
    $availability = new AvailabilityService($reservationRepo, $stayRepo);
    $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($db), $paymentRepo);
    $invoiceService = new InvoiceService($db, new InvoiceRepository($db));

    // ---- guests ----
    $guestController = new GuestController($guestRepo, $guestService, $stayRepo, $reservationRepo);
    $router->get('/guests', [$guestController, 'index'], [$auth]);
    $router->get('/guests/lookup', [$guestController, 'lookup'], [$auth]);
    $router->get('/guests/{id}', [$guestController, 'show'], [$auth]);
    $router->post('/guests/{id}/id-image', [$guestController, 'uploadIdImage'], [$auth]);
    $router->get('/guests/{id}/id-image', [$guestController, 'downloadIdImage'], [$auth]);

    // ---- reservations (bookings) ----
    $reservationService = new ReservationService($db, $reservationRepo, $roomRepo, $guestService, $availability, $paymentRepo, $settingsRepo, $audit);
    $stayService = new StayService(
        $db, $stayRepo, $reservationRepo, $roomRepo, new StayChargeRepository($db), $paymentRepo,
        new HousekeepingLogRepository($db), $settingsRepo, $guestService, $availability, $billing, $invoiceService, $audit,
    );

    $reservationController = new ReservationController($reservationService, $stayService);
    $router->get('/reservations', [$reservationController, 'index'], [$auth]);
    $router->get('/reservations/free-rooms', [$reservationController, 'freeRooms'], [$auth]);
    $router->get('/reservations/{id}', [$reservationController, 'show'], [$auth]);
    $router->post('/reservations', [$reservationController, 'create'], [$auth]);
    $router->put('/reservations/{id}', [$reservationController, 'update'], [$auth]);
    $router->post('/reservations/{id}/cancel', [$reservationController, 'cancel'], [$auth]);
    $router->post('/reservations/{id}/no-show', [$reservationController, 'noShow'], [$auth]);
    $router->post('/reservations/{id}/check-in', [$reservationController, 'checkIn'], [$auth]);

    // ---- stays (check-ins, extras, checkout, bills) ----
    $stayController = new StayController($stayService);
    $router->get('/stays', [$stayController, 'index'], [$auth]);
    $router->get('/stays/{id}', [$stayController, 'show'], [$auth]);
    $router->get('/stays/{id}/bill', [$stayController, 'bill'], [$auth]);
    $router->post('/stays', [$stayController, 'directCheckIn'], [$auth]);
    $router->post('/stays/{id}/extras', [$stayController, 'addExtra'], [$auth]);
    $router->delete('/stays/{id}/extras/{chargeId}', [$stayController, 'removeExtra'], [$auth]);
    $router->post('/stays/{id}/extend', [$stayController, 'extend'], [$auth]);
    $router->post('/stays/{id}/checkout', [$stayController, 'checkout'], [$auth]);
};
