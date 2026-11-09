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
use App\Controller\TodayCheckoutsController;
use App\Middleware\RoleMiddleware;
use App\Repository\HotelRepository;
use App\Service\TodayCheckoutsService;
use App\Support\IdImageUploader;

return static function (Router $router, PDO $db, callable $auth): void {
    $audit = new AuditLogger(new AuditLogRepository($db));
    $guestRepo = new GuestRepository($db);
    $guestService = new GuestService($guestRepo, new IdImageUploader(dirname(__DIR__) . '/storage/uploads'), $audit);
    $roomRepo = new RoomRepository($db);
    $reservationRepo = new ReservationRepository($db);
    $stayRepo = new StayRepository($db);
    $paymentRepo = new PaymentRepository($db);
    $settingsRepo = new SettingsRepository($db);
    $availability = new AvailabilityService($reservationRepo, $stayRepo);
    $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($db), $paymentRepo, $settingsRepo);
    $invoiceService = new InvoiceService($db, new InvoiceRepository($db));

    // ---- guests ----
    $guestController = new GuestController($guestRepo, $guestService, $stayRepo, $reservationRepo);
    $router->get('/guests', [$guestController, 'index'], [$auth]);
    $router->get('/guests/lookup', [$guestController, 'lookup'], [$auth]);
    $router->get('/guests/{id}', [$guestController, 'show'], [$auth]);
    $router->put('/guests/{id}', [$guestController, 'update'], [$auth]);
    $router->post('/guests/{id}/id-image', [$guestController, 'uploadIdImage'], [$auth]);
    $router->get('/guests/{id}/id-image', [$guestController, 'downloadIdImage'], [$auth]);

    // ---- reservations (bookings) ----
    $reservationService = new ReservationService($db, $reservationRepo, $roomRepo, $guestService, $availability, $paymentRepo, $settingsRepo, $audit, $stayRepo);
    $stayService = new StayService(
        $db, $stayRepo, $reservationRepo, $roomRepo, new StayChargeRepository($db), $paymentRepo,
        new HousekeepingLogRepository($db), $settingsRepo, $guestService, $availability, $billing, $invoiceService, $audit,
    );

    $reservationController = new ReservationController($reservationService, $stayService);
    $router->get('/reservations', [$reservationController, 'index'], [$auth]);
    $router->get('/reservations/free-rooms', [$reservationController, 'freeRooms'], [$auth]);
    $router->get('/reservations/{id}', [$reservationController, 'show'], [$auth]);
    $router->get('/reservations/{id}/cancellation-preview', [$reservationController, 'cancellationPreview'], [$auth]);
    $router->get('/reservations/{id}/refund-summary', [$reservationController, 'refundSummary'], [$auth]);
    $router->post('/reservations', [$reservationController, 'create'], [$auth]);
    $router->put('/reservations/{id}', [$reservationController, 'update'], [$auth]);
    $router->post('/reservations/{id}/advance-payment', [$reservationController, 'recordAdvancePayment'], [$auth]);
    $router->post('/reservations/{id}/cancel', [$reservationController, 'cancel'], [$auth]);
    $router->post('/reservations/{id}/refund', [$reservationController, 'processRefund'], [$auth]);
    $router->post('/reservations/{id}/no-show', [$reservationController, 'noShow'], [$auth]);
    $router->post('/reservations/{id}/check-in', [$reservationController, 'checkIn'], [$auth]);

    // ---- stays (check-ins, extras, checkout, bills) ----
    $stayController = new StayController($stayService);
    $router->get('/stays', [$stayController, 'index'], [$auth]);
    $router->get('/stays/{id}', [$stayController, 'show'], [$auth]);
    $router->get('/stays/{id}/bill', [$stayController, 'bill'], [$auth]);
    $router->get('/stays/{id}/early-checkout-preview', [$stayController, 'earlyCheckoutPreview'], [$auth]);
    $router->get('/stays/{id}/refund-summary', [$stayController, 'refundSummary'], [$auth]);
    $router->post('/stays', [$stayController, 'directCheckIn'], [$auth]);
    $router->post('/stays/{id}/extras', [$stayController, 'addExtra'], [$auth]);
    $router->delete('/stays/{id}/extras/{chargeId}', [$stayController, 'removeExtra'], [$auth]);
    $router->post('/stays/{id}/discount', [$stayController, 'applyDiscount'], [$auth]);
    $router->post('/stays/{id}/refund', [$stayController, 'processRefund'], [$auth]);
    $router->post('/stays/{id}/extend', [$stayController, 'extend'], [$auth]);
    $router->put('/stays/{id}/checkout-time', [$stayController, 'updateCheckout'], [$auth]);
    $router->post('/stays/{id}/checkout', [$stayController, 'checkout'], [$auth]);

    // ---- daily operations / today checkouts (restricted to front-desk staff: admin, manager, receptionist) ----
    $authorizedStaff = new RoleMiddleware(['admin', 'manager', 'receptionist']);
    $todayCheckoutsService = new TodayCheckoutsService($db, new HotelRepository($db), $settingsRepo);
    $todayCheckoutsController = new TodayCheckoutsController($todayCheckoutsService);
    $router->get('/today-checkouts', [$todayCheckoutsController, 'index'], [$auth, $authorizedStaff]);
    $router->get('/daily-ops', [$todayCheckoutsController, 'index'], [$auth, $authorizedStaff]);
};
