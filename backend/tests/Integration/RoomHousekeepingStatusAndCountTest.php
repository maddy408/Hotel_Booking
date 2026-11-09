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
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class RoomHousekeepingStatusAndCountTest extends TestCase
{
    private const HOTEL_ID = 995;
    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private ReservationRepository $reservationRepo;
    private PaymentRepository $paymentRepo;
    private HousekeepingLogRepository $hkLogRepo;

    private int $room101Id;
    private int $room102Id;
    private int $room103Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Setup test hotel 995
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test HK Hotel 995', 'Madurai')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'HKTEST', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9951, " . self::HOTEL_ID . ", 'STD', 'Standard', 2000.00, 2)");

        // Room 101 (id 99501)
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99501, " . self::HOTEL_ID . ", 101, 1, 9951, 'ok')");
        $this->room101Id = 99501;

        // Room 102 (id 99502)
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99502, " . self::HOTEL_ID . ", 102, 1, 9951, 'ok')");
        $this->room102Id = 99502;

        // Room 103 (id 99503)
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99503, " . self::HOTEL_ID . ", 103, 1, 9951, 'ok')");
        $this->room103Id = 99503;

        // Test guest
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (99501, " . self::HOTEL_ID . ", 'Test Guest', '9876500001', 'Aadhaar', '1111')");
        $this->guestId = 99501;

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $this->roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $this->hkLogRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            new StayChargeRepository($this->db),
            $this->paymentRepo,
            $this->hkLogRepo,
            $settingsRepo,
            $guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $this->roomRepo,
            $guestService,
            $availability,
            $this->paymentRepo,
            $settingsRepo,
            $audit
        );

        $this->roomService = new RoomService(
            $this->roomRepo,
            $roomTypeRepo,
            $this->hkLogRepo,
            $audit
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (99501, 99502, 99503)");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /**
     * Test 1: Occupied + cleaning.
     * Active stay takes priority: room is classified as occupied and excluded from cleaning count.
     */
    public function testOccupiedAndCleaningRoomIsClassifiedAsOccupiedAndExcludedFromCleaning(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Insert stay on room 101 with status in_house
        $this->db->exec("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
                         VALUES (" . self::HOTEL_ID . ", {$this->room101Id}, {$this->guestId}, 1, 2000.00, '{$today}', '{$tomorrow}', 'in_house')");

        // Explicitly set housekeeping status to cleaning (simulating inconsistent record like rooms 104 and 106)
        $this->roomRepo->updateHousekeeping($this->room101Id, 'cleaning', null);

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $rooms = $data['rooms'];
        $counts = $data['counts'];

        $r101 = null;
        foreach ($rooms as $r) {
            if ($r['roomNo'] === 101) {
                $r101 = $r;
                break;
            }
        }

        $this->assertNotNull($r101);
        $this->assertSame('occupied', $r101['status'], 'Operational status must be occupied');
        $this->assertSame('cleaning', $r101['housekeepingStatus'], 'Housekeeping status preserved');
        $this->assertSame(1, $counts['occupied'], 'Occupied count must include room 101');
        $this->assertSame(0, $counts['cleaning'], 'Cleaning count must exclude occupied room 101');
    }

    /**
     * Test 2: Occupied + ready.
     * Active stay with ok housekeeping: classified as occupied and excluded from cleaning count.
     */
    public function testOccupiedAndReadyRoomIsClassifiedAsOccupied(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $this->db->exec("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
                         VALUES (" . self::HOTEL_ID . ", {$this->room101Id}, {$this->guestId}, 1, 2000.00, '{$today}', '{$tomorrow}', 'in_house')");
        $this->roomRepo->updateHousekeeping($this->room101Id, 'ok', null);

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $counts = $data['counts'];

        $this->assertSame(1, $counts['occupied']);
        $this->assertSame(0, $counts['cleaning']);
    }

    /**
     * Test 3: Unoccupied + cleaning.
     * No active stay, no repair, no booking: classified as cleaning.
     */
    public function testUnoccupiedAndCleaningRoomIsClassifiedAsCleaning(): void
    {
        $this->roomRepo->updateHousekeeping($this->room102Id, 'cleaning', null);

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $rooms = $data['rooms'];
        $counts = $data['counts'];

        $r102 = null;
        foreach ($rooms as $r) {
            if ($r['roomNo'] === 102) {
                $r102 = $r;
                break;
            }
        }

        $this->assertNotNull($r102);
        $this->assertSame('cleaning', $r102['status']);
        $this->assertSame(1, $counts['cleaning']);
        $this->assertSame(0, $counts['occupied']);

        // Check-in must be rejected
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 102 is not ready (cleaning in progress)');
        $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->room102Id, '9876500002', 'Walk-in',
            'Aadhaar', '2222', 'Madurai', 1, 1, 2000.00, 500.00, 'cash', 1
        );
    }

    /**
     * Test 4: Unoccupied + ready.
     * No active stay, no repair, no booking, ok housekeeping: classified as free.
     */
    public function testUnoccupiedAndReadyRoomIsClassifiedAsFree(): void
    {
        $this->roomRepo->updateHousekeeping($this->room101Id, 'ok', null);

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $counts = $data['counts'];

        $this->assertSame(3, $counts['free']);
        $this->assertSame(0, $counts['cleaning']);
        $this->assertSame(0, $counts['occupied']);
    }

    /**
     * Test 5: Unoccupied + repair.
     * Priority 2: Repair takes precedence over cleaning/booked/free.
     */
    public function testUnoccupiedAndRepairRoomIsClassifiedAsRepair(): void
    {
        $this->roomRepo->updateHousekeeping($this->room103Id, 'repair', 'AC maintenance');

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $counts = $data['counts'];

        $this->assertSame(1, $counts['repair']);
        $this->assertSame(0, $counts['cleaning']);

        // Check-in must be rejected
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 103 is under maintenance and cannot be checked in.');
        $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->room103Id, '9876500003', 'Walk-in',
            'Aadhaar', '3333', 'Madurai', 1, 1, 2000.00, 500.00, 'cash', 1
        );
    }

    /**
     * Test 6: Booked + cleaning.
     * Priority 3: Booked takes precedence over cleaning, but cleaning status is preserved.
     */
    public function testBookedAndCleaningRoomIsClassifiedAsBookedAndExcludedFromCleaning(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Booking for today
        $this->db->exec("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
                         VALUES (" . self::HOTEL_ID . ", 'BK-HK-01', {$this->room101Id}, {$this->guestId}, '{$today}', '{$tomorrow}', 'pending', 2000.00, 500.00)");
        $this->roomRepo->updateHousekeeping($this->room101Id, 'cleaning', null);

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $rooms = $data['rooms'];
        $counts = $data['counts'];

        $r101 = null;
        foreach ($rooms as $r) {
            if ($r['roomNo'] === 101) {
                $r101 = $r;
                break;
            }
        }

        $this->assertNotNull($r101);
        $this->assertSame('booked', $r101['status'], 'Status must be booked');
        $this->assertSame('cleaning', $r101['housekeepingStatus'], 'Housekeeping status preserved');
        $this->assertFalse($r101['isReady']);
        $this->assertSame(1, $counts['booked'], 'Booked count is 1');
        $this->assertSame(0, $counts['cleaning'], 'Cleaning count must exclude booked room');
    }

    /**
     * Test 7: Checkout followed by cleaning.
     * After checkout, room housekeeping_status is automatically set to cleaning and operational status is cleaning.
     */
    public function testCheckoutFollowedByCleaningWorkflow(): void
    {
        // 1. Direct check-in on room 101
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9876500004',
            'Stay Guest',
            'Aadhaar',
            '4444',
            'Madurai',
            1,
            1,
            2000.00,
            2000.00, // full payment
            'cash',
            1
        );

        $stayId = (int) $stay['id'];
        $initialData = $this->roomService->listRooms(self::HOTEL_ID);
        $this->assertSame(1, $initialData['counts']['occupied']);
        $this->assertSame(0, $initialData['counts']['cleaning']);

        // 2. Complete checkout (balance is 100.00 due to 5% GST on 2000.00 rate)
        $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 100.0);

        // 3. Room must now have housekeeping_status = cleaning
        $room = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $room['housekeeping_status']);

        // 4. Housekeeping log recorded
        $logs = $this->hkLogRepo->forRoom($this->room101Id);
        $this->assertNotEmpty($logs);
        $this->assertSame('cleaning', $logs[0]['action']);

        // 5. listRooms status resolves to cleaning
        $afterData = $this->roomService->listRooms(self::HOTEL_ID);
        $this->assertSame(0, $afterData['counts']['occupied']);
        $this->assertSame(1, $afterData['counts']['cleaning']);
    }

    /**
     * Test 8: Cleaning followed by Mark Ready.
     * When housekeeping marks the room ready, status becomes free and cleaning count decrements.
     */
    public function testCleaningFollowedByMarkReadyWorkflow(): void
    {
        // Set room 102 to cleaning
        $this->roomRepo->updateHousekeeping($this->room102Id, 'cleaning', null);

        $beforeData = $this->roomService->listRooms(self::HOTEL_ID);
        $this->assertSame(1, $beforeData['counts']['cleaning']);
        $this->assertSame(2, $beforeData['counts']['free']);

        // Mark ready
        $updatedRoom = $this->roomService->setHousekeeping($this->room102Id, 'ready', null, 1, self::HOTEL_ID);
        $this->assertSame('ok', $updatedRoom['housekeeping_status']);

        // Housekeeping log recorded
        $logs = $this->hkLogRepo->forRoom($this->room102Id);
        $this->assertNotEmpty($logs);
        $this->assertSame('ready', $logs[0]['action']);

        // listRooms resolves to free
        $afterData = $this->roomService->listRooms(self::HOTEL_ID);
        $this->assertSame(0, $afterData['counts']['cleaning']);
        $this->assertSame(3, $afterData['counts']['free']);
    }

    /**
     * Test 9: Ordinary housekeeping actions must NOT mark an occupied room as awaiting cleaning.
     */
    public function testOrdinaryHousekeepingCannotMarkOccupiedRoomAsCleaning(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Check in room 101
        $this->db->exec("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
                         VALUES (" . self::HOTEL_ID . ", {$this->room101Id}, {$this->guestId}, 1, 2000.00, '{$today}', '{$tomorrow}', 'in_house')");

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 101 is currently occupied. Housekeeping cannot mark an occupied room as awaiting cleaning.');

        $this->roomService->setHousekeeping($this->room101Id, 'cleaning', null, 1, self::HOTEL_ID);
    }
}
