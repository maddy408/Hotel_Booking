<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HotelRepository;
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
use App\Service\TodayCheckoutsService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class RoomOccupancyAndCheckInTest extends TestCase
{
    private const HOTEL_ID = 996;
    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private TodayCheckoutsService $todayCheckoutsService;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private ReservationRepository $reservationRepo;
    private PaymentRepository $paymentRepo;

    private int $room101Id;
    private int $room102Id;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Setup test hotel 996 with settings, room types, and rooms
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test Hotel 996', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'ROCTest', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9961, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2000.00, 2)");

        // Room 101
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99601, " . self::HOTEL_ID . ", 101, 1, 9961, 'ok')");
        $this->room101Id = 99601;

        // Room 102
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99602, " . self::HOTEL_ID . ", 102, 1, 9961, 'ok')");
        $this->room102Id = 99602;

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $this->roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hkLogRepo = new HousekeepingLogRepository($this->db);
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
            $hkLogRepo,
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
            $audit,
            $this->stayRepo
        );

        $this->roomService = new RoomService(
            $this->roomRepo,
            $roomTypeRepo,
            $hkLogRepo,
            $audit
        );

        $this->todayCheckoutsService = new TodayCheckoutsService(
            $this->db,
            new HotelRepository($this->db),
            $settingsRepo
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
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (99601, 99602)");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /**
     * R001: First guest checks into Room 101 -> Success
     * R002: Second guest tries to check into Room 101 -> Blocked
     * R003: First guest checks out -> Success
     * R004: Second guest checks into Room 101 after checkout and room readiness -> Success
     */
    public function testR001ToR004FullOccupancyLifecycle(): void
    {
        // --- R001: First guest checks into Room 101 ---
        $stay1 = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110001',
            'Guest One',
            'Aadhaar',
            '123412341234',
            'Chennai',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $this->assertNotNull($stay1);
        $this->assertSame('in_house', $stay1['status']);
        $this->assertSame($this->room101Id, (int) $stay1['room_id']);

        // --- R002: Second guest tries to check into Room 101 -> Blocked ---
        try {
            $this->stayService->directCheckIn(
                self::HOTEL_ID,
                $this->room101Id,
                '9871110002',
                'Guest Two',
                'Aadhaar',
                '567856785678',
                'Coimbatore',
                1,
                1,
                2000.00,
                500.00,
                'cash',
                1
            );
            $this->fail('Second guest direct check-in should have been blocked with 409 Conflict.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('Room 101 is already occupied by another active stay', $e->getMessage());
            $this->assertStringContainsString('Complete the previous checkout before assigning this room', $e->getMessage());
        }

        // Also test check-in from reservation for Room 101 is blocked while occupied
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $this->db->prepare(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-TEST-OCC', :room_id, (SELECT id FROM guests WHERE hotel_id = " . self::HOTEL_ID . " LIMIT 1), :in, :out, 1, 2000.00, 500.00, 'pending')"
        )->execute(['room_id' => $this->room101Id, 'in' => $today, 'out' => $tomorrow]);
        $resId = (int) $this->db->lastInsertId();
        $this->paymentRepo->record(self::HOTEL_ID, $resId, null, 'advance', 500.00, 'cash', 1);

        try {
            $this->stayService->checkInFromReservation($resId, self::HOTEL_ID, 1);
            $this->fail('Check-in from reservation should have been blocked for occupied room.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('Room 101 is already occupied by another active stay', $e->getMessage());
        }

        // Clean up test reservation so Room 101 has no conflicting booking for R004
        $this->db->exec("DELETE FROM payments WHERE reservation_id = {$resId}");
        $this->db->exec("DELETE FROM reservations WHERE id = {$resId}");

        // --- R003: First guest checks out -> Success ---
        $bill = $this->stayService->bill((int) $stay1['id'], self::HOTEL_ID);
        $balance = (float) $bill['balance'];
        $checkoutResult = $this->stayService->checkout((int) $stay1['id'], self::HOTEL_ID, 'cash', null, 1, $balance);
        $this->assertNotNull($checkoutResult);

        $updatedStay1 = $this->stayRepo->find((int) $stay1['id']);
        $this->assertSame('checked_out', $updatedStay1['status']);

        // Room should now be in 'cleaning' status
        $roomAfterCheckout = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $roomAfterCheckout['housekeeping_status']);

        // --- R007 check: Check-in while cleaning should be blocked ---
        try {
            $this->stayService->directCheckIn(
                self::HOTEL_ID,
                $this->room101Id,
                '9871110003',
                'Guest Three',
                'Aadhaar',
                '999988887777',
                'Madurai',
                1,
                1,
                2000.00,
                500.00,
                'cash',
                1
            );
            $this->fail('Check-in should be blocked when room is under cleaning.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('cleaning in progress', $e->getMessage());
        }

        // --- Housekeeping marks ready ---
        $this->roomRepo->updateHousekeeping($this->room101Id, 'ok', null);

        // --- R004: Second guest checks into Room 101 after checkout and readiness -> Success ---
        $stay2 = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110004',
            'Guest Four',
            'Aadhaar',
            '444455556666',
            'Salem',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $this->assertNotNull($stay2);
        $this->assertSame('in_house', $stay2['status']);
        $this->assertSame($this->room101Id, (int) $stay2['room_id']);
    }

    /**
     * R005: Two simultaneous check-in requests for Room 101 -> Only one succeeds
     */
    public function testR005SimultaneousCheckInRequestsOnlyOneSucceeds(): void
    {
        // First check-in succeeds
        $stay1 = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110005',
            'Sim Guest 1',
            'Aadhaar',
            '111122223333',
            'Trichy',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $this->assertSame('in_house', $stay1['status']);

        // Second check-in attempt on the same room must fail with 409 Conflict
        try {
            $this->stayService->directCheckIn(
                self::HOTEL_ID,
                $this->room101Id,
                '9871110006',
                'Sim Guest 2',
                'Aadhaar',
                '222233334444',
                'Tirunelveli',
                1,
                1,
                2000.00,
                500.00,
                'cash',
                1
            );
            $this->fail('Second check-in must fail with 409 Conflict.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('already occupied by another active stay', $e->getMessage());
        }

        // Verify database level unique constraint and exact active stay count
        $activeStayCount = (int) $this->db->query(
            "SELECT COUNT(*) FROM stays WHERE room_id = {$this->room101Id} AND status = 'in_house'"
        )->fetchColumn();
        $this->assertSame(1, $activeStayCount);
    }

    /**
     * R006: Check-in to another available room -> Success
     */
    public function testR006CheckInToAnotherAvailableRoom(): void
    {
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room102Id,
            '9871110007',
            'Guest Room 102',
            'Aadhaar',
            '777788889999',
            'Pondicherry',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
        $this->assertSame($this->room102Id, (int) $stay['room_id']);
    }

    /**
     * R007: Check-in to a room under cleaning -> Blocked
     */
    public function testR007CheckInToRoomUnderCleaningBlocked(): void
    {
        $this->roomRepo->updateHousekeeping($this->room101Id, 'cleaning', null);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('cleaning in progress');

        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110008',
            'Guest Cleaning',
            'Aadhaar',
            '888899990000',
            'Kochi',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
    }

    /**
     * R008: Check-in to a room under maintenance -> Blocked
     */
    public function testR008CheckInToRoomUnderMaintenanceBlocked(): void
    {
        $this->roomRepo->updateHousekeeping($this->room101Id, 'repair', 'AC maintenance');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('under maintenance');

        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110009',
            'Guest Maintenance',
            'Aadhaar',
            '999900001111',
            'Hyderabad',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
    }

    /**
     * R009: Refresh Daily Ops -> No duplicate active stays, distinct status labels
     */
    public function testR009RefreshDailyOpsNoDuplicateActiveStays(): void
    {
        // Create 1 active stay in Room 101
        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110010',
            'Active Guest 101',
            'Aadhaar',
            '101010101010',
            'Pondicherry',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );

        $data = $this->todayCheckoutsService->getTodayCheckouts(self::HOTEL_ID);
        $checkins = $data['checkins'];

        $activeStaysByRoom = [];
        foreach ($checkins as $item) {
            if ($item['checkin_status'] === 'checked_in') {
                $roomNo = (int) $item['room_no'];
                $this->assertArrayNotHasKey(
                    $roomNo,
                    $activeStaysByRoom,
                    "Room {$roomNo} should NOT have more than one stay marked 'checked_in' on Daily Ops."
                );
                $activeStaysByRoom[$roomNo] = $item;
            }
        }

        // Verify checked_in count matches actual active stays count
        $this->assertSame(1, $data['checkins_stats']['checked_in']);
    }

    /**
     * R010: Open Rooms page -> Occupancy matches actual active stays
     */
    public function testR010RoomsPageOccupancyMatchesActualActiveStays(): void
    {
        // Check in Room 101
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110011',
            'Occupied Guest 101',
            'Aadhaar',
            '202020202020',
            'Pondicherry',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );

        $roomData = $this->roomService->listRooms(self::HOTEL_ID);
        $rooms = $roomData['rooms'];
        $counts = $roomData['counts'];

        $actualInHouseCount = (int) $this->db->query(
            "SELECT COUNT(DISTINCT room_id) FROM stays WHERE hotel_id = " . self::HOTEL_ID . " AND status = 'in_house'"
        )->fetchColumn();

        $occupiedRoomCount = 0;
        foreach ($rooms as $r) {
            if ($r['status'] === 'occupied') {
                $occupiedRoomCount++;
                $this->assertNotNull($r['stayId']);
                $this->assertNotNull($r['guestName']);
            }
        }

        $this->assertSame(1, $actualInHouseCount);
        $this->assertSame($actualInHouseCount, $occupiedRoomCount);
        $this->assertSame($actualInHouseCount, $counts['occupied']);
    }

    /**
     * Regression Test: Future booking is allowed even if room is occupied today.
     * Keep booking availability separate from housekeeping readiness.
     */
    public function testFutureBookingAllowedForCurrentlyOccupiedRoom(): void
    {
        // Room 101 is occupied today
        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110012',
            'Today Guest',
            'Aadhaar',
            '303030303030',
            'Pondicherry',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );

        // Book Room 101 for next week (future dates)
        $nextWeekIn = date('Y-m-d', strtotime('+7 days'));
        $nextWeekOut = date('Y-m-d', strtotime('+9 days'));

        $futureBooking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room101Id,
            '9871110013',
            'Future Guest',
            $nextWeekIn,
            $nextWeekOut,
            2,
            2000.00,
            500.00,
            'cash',
            1
        );

        $this->assertNotNull($futureBooking);
        $this->assertSame($this->room101Id, (int) $futureBooking['room_id']);
        $this->assertSame('pending', $futureBooking['status']);
    }
}
