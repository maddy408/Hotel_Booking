<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Controller\ReservationController;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class CheckInOverdueIntegrationTest extends TestCase
{
    private const HOTEL_ID = 993;
    private PDO $db;
    private ReservationRepository $reservationRepo;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private PaymentRepository $paymentRepo;
    private SettingsRepository $settingsRepo;
    private ReservationService $reservationService;
    private StayService $stayService;
    private ReservationController $controller;

    private int $roomId;
    private int $guestId;
    private array $rooms = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Hotel & Settings
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Overdue Sync Hotel 993', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, booking_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'OD993', 'BK993', 12, 'Asia/Kolkata')");

        // Room Type & Rooms
        $this->db->exec("INSERT INTO room_types (hotel_id, code, name, rate, max_persons) VALUES (" . self::HOTEL_ID . ", 'DLX', 'Deluxe', 2000.00, 2)");
        $roomTypeId = (int) $this->db->lastInsertId();

        $this->db->exec("INSERT INTO rooms (hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES
            (" . self::HOTEL_ID . ", 901, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 902, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 903, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 904, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 905, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 906, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 907, 9, {$roomTypeId}, 'ok'),
            (" . self::HOTEL_ID . ", 908, 9, {$roomTypeId}, 'ok')");

        $stmt = $this->db->query("SELECT room_no, id FROM rooms WHERE hotel_id = " . self::HOTEL_ID . " ORDER BY room_no");
        $this->rooms = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        $this->roomId = (int) $this->rooms[901];

        // Guest
        $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (" . self::HOTEL_ID . ", 'Test Overdue Guest', '9898989898')");
        $this->guestId = (int) $this->db->lastInsertId();

        // Wiring services
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->roomRepo = new RoomRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $auditRepo = new AuditLogRepository($this->db);
        $audit = new AuditLogger($auditRepo);

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $this->roomRepo,
            $guestService,
            $availability,
            $this->paymentRepo,
            $this->settingsRepo,
            $audit
        );

        $billingService = new BillingService(new GstService($this->settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            new StayChargeRepository($this->db),
            $this->paymentRepo,
            new HousekeepingLogRepository($this->db),
            $this->settingsRepo,
            $guestService,
            $availability,
            $billingService,
            $invoiceService,
            $audit
        );

        $this->controller = new ReservationController($this->reservationService, $this->stayService);
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM payments WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stay_charges WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    public function testOverdueRetrievalAndFilteringAgainstDatabase(): void
    {
        $today = $this->reservationService->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));
        $pastOut = date('Y-m-d', strtotime($today . ' -1 day'));
        $futureDate = date('Y-m-d', strtotime($today . ' +2 days'));
        $futureOut = date('Y-m-d', strtotime($today . ' +3 days'));

        // 1. Past check-in, pending (Overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-OD-1', {$this->rooms[901]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'pending', 2000, 500)");
        $odId = (int) $this->db->lastInsertId();

        // 2. Today check-in, pending (Not overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-TODAY-1', {$this->rooms[902]}, {$this->guestId}, '{$today}', '{$futureDate}', 'pending', 2000, 500)");

        // 3. Future check-in, pending (Not overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-FUT-1', {$this->rooms[903]}, {$this->guestId}, '{$futureDate}', '{$futureOut}', 'pending', 2000, 500)");

        // 4. Past check-in, cancelled (Must NOT appear in pending list or overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-CANC-1', {$this->rooms[904]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'cancelled', 2000, 0)");

        // 5. Past check-in, no_show (Must NOT appear in pending list or overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-NOSHOW-1', {$this->rooms[905]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'no_show', 2000, 0)");

        // 6. Past check-in, checked_in (Must NOT appear in pending list or overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-CHKIN-1', {$this->rooms[906]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'checked_in', 2000, 0)");

        // 7. Past check-in with occupied room (Still Overdue)
        $this->db->exec("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
            VALUES (" . self::HOTEL_ID . ", {$this->rooms[907]}, {$this->guestId}, 2, 2000, '{$today}', '{$futureDate}', 'in_house')");
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-OCC-1', {$this->rooms[907]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'pending', 2000, 500)");

        // 8. Past check-in with unpaid advance (Overdue)
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
            VALUES (" . self::HOTEL_ID . ", 'BK-NOADV-1', {$this->rooms[908]}, {$this->guestId}, '{$pastDate}', '{$pastOut}', 'pending', 2000, 0)");

        // Fetch through controller / API
        $req = new Request('GET', '/reservations', [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', self::HOTEL_ID);
        $list = $this->controller->index($req);

        // listPending only returns 'pending' reservations: exactly 5 (BK-OD-1, BK-TODAY-1, BK-FUT-1, BK-OCC-1, BK-NOADV-1)
        $this->assertCount(5, $list);

        $byCode = [];
        foreach ($list as $r) {
            $byCode[$r['booking_code']] = $r;
        }

        // Scenario 1: Past pending -> overdue
        $this->assertTrue($byCode['BK-OD-1']['is_overdue']);
        $this->assertTrue($byCode['BK-OD-1']['check_in_overdue']);
        $this->assertSame($today, $byCode['BK-OD-1']['hotel_today']);

        // Scenario 2: Today pending -> not overdue
        $this->assertFalse($byCode['BK-TODAY-1']['is_overdue']);
        $this->assertFalse($byCode['BK-TODAY-1']['check_in_overdue']);

        // Scenario 3: Future pending -> not overdue
        $this->assertFalse($byCode['BK-FUT-1']['is_overdue']);
        $this->assertFalse($byCode['BK-FUT-1']['check_in_overdue']);

        // Scenario 4, 5, 6: Cancelled, no_show, checked_in do NOT appear
        $this->assertArrayNotHasKey('BK-CANC-1', $byCode);
        $this->assertArrayNotHasKey('BK-NOSHOW-1', $byCode);
        $this->assertArrayNotHasKey('BK-CHKIN-1', $byCode);

        // Scenario 7: Past pending with occupied room -> is overdue
        $this->assertTrue($byCode['BK-OCC-1']['is_overdue']);
        $this->assertTrue($byCode['BK-OCC-1']['check_in_overdue']);

        // Scenario 8: Past pending with unpaid advance -> is overdue
        $this->assertTrue($byCode['BK-NOADV-1']['is_overdue']);
        $this->assertTrue($byCode['BK-NOADV-1']['check_in_overdue']);

        // Query with status=overdue filter -> exactly 3 (BK-OD-1, BK-OCC-1, BK-NOADV-1)
        $reqOverdue = new Request('GET', '/reservations', ['status' => 'overdue'], [], [], '127.0.0.1');
        $reqOverdue->setAttribute('hotelId', self::HOTEL_ID);
        $overdueList = $this->controller->index($reqOverdue);

        $this->assertCount(3, $overdueList);
        $overdueCodes = array_column($overdueList, 'booking_code');
        $this->assertContains('BK-OD-1', $overdueCodes);
        $this->assertContains('BK-OCC-1', $overdueCodes);
        $this->assertContains('BK-NOADV-1', $overdueCodes);

        // Test marking as no-show removes it from overdue
        $this->reservationService->markNoShow($odId, self::HOTEL_ID, 1);
        $updatedOverdueList = $this->controller->index($reqOverdue);
        $this->assertCount(2, $updatedOverdueList);
    }
}
