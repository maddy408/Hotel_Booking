<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Controller\GuestController;
use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HotelRepository;
use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\OccupantDocumentService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use App\Support\Crypto;
use App\Support\IdImageUploader;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestDetailsAndEditTest extends TestCase
{
    private PDO $db;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private GuestController $controller;
    private StayRepository $stayRepo;
    private ReservationRepository $reservationRepo;
    private OccupantRepository $occupantRepo;
    private OccupantDocumentRepository $occupantDocRepo;
    private PaymentRepository $paymentRepo;
    private BillingService $billing;
    private OccupantDocumentService $occupantDocService;

    private int $testGuestId;
    private int $testRoomId;
    private int $testReservationId;
    private int $testStayId;
    private int $testPaymentId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->guestRepo = new GuestRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->occupantRepo = new OccupantRepository($this->db);
        $this->occupantDocRepo = new OccupantDocumentRepository($this->db);
        $uploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $this->occupantDocService = new OccupantDocumentService(
            $this->occupantRepo,
            $this->occupantDocRepo,
            $this->stayRepo,
            $uploader,
            $this->reservationRepo
        );
        $settingsRepo = new SettingsRepository($this->db);
        $gstService = new GstService($settingsRepo);
        $this->billing = new BillingService(
            $gstService,
            new StayChargeRepository($this->db),
            $this->paymentRepo,
            $settingsRepo,
            new HotelRepository($this->db)
        );

        $this->controller = new GuestController(
            $this->guestRepo,
            $this->guestService,
            $this->stayRepo,
            $this->reservationRepo,
            $this->occupantDocService,
            $this->paymentRepo,
            $this->billing
        );

        // Create a unique test guest
        $testPhone = '999' . str_pad((string) mt_rand(1000000, 9999999), 7, '0', STR_PAD_LEFT);
        $this->testGuestId = $this->guestRepo->create(
            1,
            'Test Details Guest',
            $testPhone,
            'Aadhaar',
            Crypto::encrypt('123456789012'),
            '9012',
            'Test City',
            'test.details@example.com',
            '100 Test St, Test City'
        );

        // Fetch a room
        $roomStmt = $this->db->query('SELECT id, room_no FROM rooms WHERE hotel_id = 1 LIMIT 1');
        $room = $roomStmt->fetch(PDO::FETCH_ASSOC);
        $this->testRoomId = (int) $room['id'];

        // Create a test reservation
        $code = 'BK-TST' . mt_rand(1000, 9999);
        $resStmt = $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, status)
             VALUES (1, :code, :room_id, :guest_id, "2026-12-01", "2026-12-03", 2, 2500.00, 500.00, "pending")'
        );
        $resStmt->execute([
            'code' => $code,
            'room_id' => $this->testRoomId,
            'guest_id' => $this->testGuestId,
        ]);
        $this->testReservationId = (int) $this->db->lastInsertId();

        // Create a test stay
        $stayStmt = $this->db->prepare(
            'INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status)
             VALUES (1, :room_id, :guest_id, 2, 2500.00, "2026-10-10", "2026-10-12", "2026-10-12", "checked_out")'
        );
        $stayStmt->execute([
            'room_id' => $this->testRoomId,
            'guest_id' => $this->testGuestId,
        ]);
        $this->testStayId = (int) $this->db->lastInsertId();

        // Add occupants for this stay
        $this->occupantRepo->create(1, $this->testStayId, 1, 'Test Details Guest', true, $this->testGuestId, 'Male', $testPhone);
        $this->occupantRepo->create(1, $this->testStayId, 2, 'Accompanying Person', false, null, 'Female', '9876543210');

        // Record a payment
        $this->testPaymentId = $this->paymentRepo->record(
            1,
            $this->testReservationId,
            null,
            'advance',
            500.00,
            'upi',
            1,
            'Advance payment for test booking'
        );
    }

    protected function tearDown(): void
    {
        // Cleanup test fixtures
        $this->db->exec("DELETE FROM payments WHERE id = {$this->testPaymentId}");
        $this->db->exec("DELETE FROM occupants WHERE stay_id = {$this->testStayId}");
        $this->db->exec("DELETE FROM stays WHERE id = {$this->testStayId}");
        $this->db->exec("DELETE FROM reservations WHERE id = {$this->testReservationId}");
        $this->db->exec("DELETE FROM guests WHERE id = {$this->testGuestId}");
    }

    public function testShowReturnsCompleteGuestProfileAndSections(): void
    {
        $req = new Request('GET', "/guests/{$this->testGuestId}", [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => $this->testGuestId];

        $data = $this->controller->show($req);

        // Guest profile & Personal information
        $this->assertSame($this->testGuestId, $data['id']);
        $this->assertSame('Test Details Guest', $data['name']);
        $this->assertSame('test.details@example.com', $data['email']);
        $this->assertSame('Test City', $data['city']);
        $this->assertSame('100 Test St, Test City', $data['address']);
        $this->assertSame('Aadhaar', $data['idProofType']);
        $this->assertStringContainsString('9012', $data['idProofMasked']);
        $this->assertSame('Male', $data['gender']);

        // Booking History
        $this->assertNotEmpty($data['bookings']);
        $bk = $data['bookings'][0];
        $this->assertSame($this->testReservationId, (int) $bk['id']);
        $this->assertNotEmpty($bk['room_type']);
        $this->assertSame(2, $bk['nights']); // 2026-12-01 to 2026-12-03
        $this->assertSame(500.0, $bk['advance_amount']);

        // Stay History & Occupants
        $this->assertNotEmpty($data['stays']);
        $st = $data['stays'][0];
        $this->assertSame($this->testStayId, (int) $st['id']);
        $this->assertNotEmpty($st['room_type']);
        $this->assertSame(2, $st['nights']);
        $this->assertCount(2, $st['occupants']);
        $this->assertSame('Test Details Guest', $st['occupants'][0]['name']);
        $this->assertSame(1, (int) $st['occupants'][0]['is_primary']);
        $this->assertSame('Accompanying Person', $st['occupants'][1]['name']);
        $this->assertSame(0, (int) $st['occupants'][1]['is_primary']);

        // Payment History
        $this->assertNotEmpty($data['payments']);
        $pm = $data['payments'][0];
        $this->assertSame($this->testPaymentId, (int) $pm['id']);
        $this->assertSame('advance', $pm['type']);
        $this->assertSame(500.0, $pm['amount']);
        $this->assertSame('upi', $pm['method']);
        $this->assertNotEmpty($pm['reference']);

        // Visit Summary
        $this->assertArrayHasKey('summary', $data);
        $this->assertSame(1, $data['summary']['totalVisits']);
        $this->assertSame(1, $data['summary']['completedStays']);
        $this->assertSame('Upcoming Booking', $data['summary']['currentStayStatus']);
        $this->assertSame('2026-10-12', $data['summary']['lastVisitDate']);
    }

    public function testGuestUpdatePreservesHistoricalStayAndPaymentRecords(): void
    {
        $updateReq = new Request(
            'PUT',
            "/guests/{$this->testGuestId}",
            [],
            [
                'name' => 'Updated Guest Name',
                'phone' => '9998887776',
                'email' => 'updated.guest@example.com',
                'city' => 'Updated City',
                'address' => 'Updated Address',
                'idProofType' => 'Passport',
            ],
            [],
            '127.0.0.1'
        );
        $updateReq->setAttribute('hotelId', 1);
        $updateReq->setAttribute('userId', 1);
        $updateReq->routeParams = ['id' => $this->testGuestId];

        $updated = $this->controller->update($updateReq);
        $this->assertSame('Updated Guest Name', $updated['name']);
        $this->assertSame('9998887776', $updated['phone']);
        $this->assertSame('updated.guest@example.com', $updated['email']);
        $this->assertSame('Updated City', $updated['city']);
        $this->assertSame('Updated Address', $updated['address']);

        // Verify historical booking, stay, and payments were NOT modified
        $res = $this->reservationRepo->find($this->testReservationId);
        $this->assertSame('500.00', $res['advance_amount']);
        $this->assertSame('2500.00', $res['rate']);

        $stay = $this->stayRepo->find($this->testStayId);
        $this->assertSame('checked_out', $stay['status']);
        $this->assertSame('2026-10-12', $stay['checkout_actual']);

        $payment = $this->paymentRepo->find($this->testPaymentId);
        $this->assertSame('500.00', $payment['amount']);
        $this->assertSame('advance', $payment['type']);
    }

    public function testCannotAccessGuestFromAnotherHotel(): void
    {
        $req = new Request('GET', "/guests/{$this->testGuestId}", [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 999); // foreign hotel
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => $this->testGuestId];

        $this->expectException(ApiException::class);
        $this->controller->show($req);
    }
}
