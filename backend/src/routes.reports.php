<?php

declare(strict_types=1);

use App\Controller\InvoiceController;
use App\Controller\ReportController;
use App\Middleware\RoleMiddleware;
use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReportRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Router;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\ReportService;

return static function (Router $router, PDO $db, callable $auth): void {
    $staffOnly = new RoleMiddleware(['admin', 'manager']);

    $reportController = new ReportController(new ReportService(new ReportRepository($db), new InvoiceRepository($db)));
    $router->get('/reports/today', [$reportController, 'today'], [$auth]);
    $router->get('/reports/day-end', [$reportController, 'dayEnd'], [$auth, $staffOnly]);
    $router->get('/reports/occupancy', [$reportController, 'occupancy'], [$auth, $staffOnly]);
    $router->get('/reports/revenue', [$reportController, 'revenue'], [$auth, $staffOnly]);
    $router->get('/reports/invoices.csv', [$reportController, 'exportCsv'], [$auth, $staffOnly]);

    $settingsRepo = new SettingsRepository($db);
    $gstService = new GstService($settingsRepo);
    $billing = new BillingService(
        $gstService,
        new StayChargeRepository($db),
        new PaymentRepository($db),
        $settingsRepo,
        new HotelRepository($db)
    );

    $invoiceController = new InvoiceController(
        new InvoiceRepository($db),
        new StayRepository($db),
        new StayChargeRepository($db),
        new HotelRepository($db),
        new PaymentRepository($db),
        $billing,
        $settingsRepo
    );
    $router->get('/invoices/{id}', [$invoiceController, 'show'], [$auth]);
    $router->put('/invoices/{id}', [$invoiceController, 'update'], [$auth, $staffOnly]);
    $router->get('/stays/{stayId}/invoice', [$invoiceController, 'byStay'], [$auth]);
};
