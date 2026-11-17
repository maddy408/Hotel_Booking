<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
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
use App\Service\OccupantDocumentService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\AuditLogger;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class RoomTilePersonsCountCheckInTest extends TestCase
{
    private const HOTEL_ID = 988;

    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private OccupantDocumentService $occupantDocService;

    private int $room101Id;
    private int $room201Id;
    private int $room301Id;
    private int $room401Id;

    private string $tempDir;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->tempDir = sys_get_temp_dir() . '/tc_pers_test_' . bin2hex(random_bytes(4));
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
        $uploader = new OccupantDocumentUploader($this->tempDir);

        // Hotel & Settings
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Grand Horizon Pondy', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'GHP', 12, 'Asia/Kolkata')");

        // Room Types across different categories & capacities
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9881, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 1500.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9882, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2500.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9883, " . self::HOTEL_ID . ", 'SUI', 'Suite Room', 4000.00, 3)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9884, " . self::HOTEL_ID . ", 'FAM', 'Family Suite', 6000.00, 4)");

        // Rooms across multiple floors
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (98801, " . self::HOTEL_ID . ", 101, 1, 9881, 'ok')");
        $this->room101Id = 98801;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (98802, " . self::HOTEL_ID . ", 201, 2, 9882, 'ok')");
        $this->room201Id = 98802;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (98803, " . self::HOTEL_ID . ", 301, 3, 9883, 'ok')");
        $this->room301Id = 98803;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (98804, " . self::HOTEL_ID . ", 401, 4, 9884, 'ok')");
        $this->room401Id = 98804;

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $reservationRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hkLogRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($reservationRepo, $stayRepo);
        $gstService = new GstService($settingsRepo);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $this->occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $stayRepo, $uploader, $reservationRepo);

        $this->stayService = new StayService(
            $this->db,
            $stayRepo,
            $reservationRepo,
            $roomRepo,
            new StayChargeRepository($this->db),
            $paymentRepo,
            $hkLogRepo,
            $settingsRepo,
            $guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            $gstService,
            $this->occupantDocService
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $reservationRepo,
            $roomRepo,
            $guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $audit,
            $stayRepo
        );

        $this->roomService = new RoomService(
            $roomRepo,
            $roomTypeRepo,
            $hkLogRepo,
            $audit
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        if (is_dir($this->tempDir)) {
            $this->rrmdir($this->tempDir);
        }
    }

    private function rrmdir(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $file) {
            if ($file === '.' || $file === '..') continue;
            $path = $dir . '/' . $file;
            if (is_dir($path)) {
                $this->rrmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM occupant_documents WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM occupants WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (98801, 98802, 98803, 98804)");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /**
     * Test Case 1: Booking for 2 persons and check-in with 2 persons -> Room tile shows 2 Persons.
     */
    public function testCase1BookingFor2PersonsAndCheckInWith2Persons(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room101Id,
            '9876543210',
            'Ramya',
            $today,
            $tomorrow,
            2,
            1500.00,
            500.00,
            'cash',
            1
        );

        $this->assertSame(2, (int) $booking['persons']);

        // Before check-in: Rooms API returns status 'booked' with 2 persons
        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $room101 = $this->findRoomInList($roomsData['rooms'], 101);
        $this->assertSame('booked', $room101['status']);
        $this->assertSame(2, $room101['persons']);

        // Check in from reservation with confirmed 2 persons
        $occupants = [
            ['name' => 'Ramya', 'gender' => 'Female', 'phone' => '9876543210'],
            ['name' => 'Karthik', 'gender' => 'Male', 'phone' => '9876543211'],
        ];

        $stay = $this->stayService->checkInFromReservation(
            (int) $booking['id'],
            self::HOTEL_ID,
            1,
            2,
            [],
            [],
            $occupants,
            false
        );

        $this->assertSame(2, (int) $stay['persons']);

        // Database stays table verification
        $stmt = $this->db->prepare("SELECT persons FROM stays WHERE id = :id");
        $stmt->execute(['id' => $stay['id']]);
        $this->assertSame(2, (int) $stmt->fetchColumn());

        // Rooms API response verification
        $roomsDataAfter = $this->roomService->listRooms(self::HOTEL_ID);
        $room101After = $this->findRoomInList($roomsDataAfter['rooms'], 101);
        $this->assertSame('occupied', $room101After['status']);
        $this->assertSame(2, $room101After['persons']);
        $this->assertSame('Ramya', $room101After['guestName']);
    }

    /**
     * Test Case 2: Booking for 3 persons (Suite) and check-in with 3 persons -> Room tile shows 3 Persons.
     */
    public function testCase2BookingFor3PersonsAndCheckInWith3Persons(): void
    {
        $today = date('Y-m-d');
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room301Id,
            '9876543220',
            'Suresh Kumar',
            $today,
            $dayAfter,
            3,
            4000.00,
            1000.00,
            'cash',
            1
        );

        $this->assertSame(3, (int) $booking['persons']);

        // Rooms API before check-in
        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $room301 = $this->findRoomInList($roomsData['rooms'], 301);
        $this->assertSame('booked', $room301['status']);
        $this->assertSame(3, $room301['persons']);

        // Check in from reservation with confirmed 3 persons
        $occupants = [
            ['name' => 'Suresh Kumar', 'gender' => 'Male', 'phone' => '9876543220'],
            ['name' => 'Meena Suresh', 'gender' => 'Female', 'phone' => '9876543221'],
            ['name' => 'Aravind Suresh', 'gender' => 'Male', 'phone' => '9876543222'],
        ];

        $stay = $this->stayService->checkInFromReservation(
            (int) $booking['id'],
            self::HOTEL_ID,
            1,
            3,
            [],
            [],
            $occupants,
            false
        );

        $this->assertSame(3, (int) $stay['persons']);

        // Database stays table verification
        $stmt = $this->db->prepare("SELECT persons FROM stays WHERE id = :id");
        $stmt->execute(['id' => $stay['id']]);
        $this->assertSame(3, (int) $stmt->fetchColumn());

        // Rooms API response verification
        $roomsDataAfter = $this->roomService->listRooms(self::HOTEL_ID);
        $room301After = $this->findRoomInList($roomsDataAfter['rooms'], 301);
        $this->assertSame('occupied', $room301After['status']);
        $this->assertSame(3, $room301After['persons']);
        $this->assertSame('Suresh Kumar', $room301After['guestName']);
    }

    /**
     * Test Case 3: Booking for 2 persons, but receptionist confirms 1 person during check-in -> Room tile shows 1 Person.
     */
    public function testCase3BookingFor2PersonsConfirmedAs1PersonDuringCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room201Id,
            '9876543230',
            'Priya Sharma',
            $today,
            $tomorrow,
            2,
            2500.00,
            500.00,
            'upi',
            1
        );

        $this->assertSame(2, (int) $booking['persons']);

        // Receptionist confirms 1 person during check-in
        $occupants = [
            ['name' => 'Priya Sharma', 'gender' => 'Female', 'phone' => '9876543230'],
        ];

        $stay = $this->stayService->checkInFromReservation(
            (int) $booking['id'],
            self::HOTEL_ID,
            1,
            1, // Receptionist confirmed count is 1
            [],
            [],
            $occupants,
            false
        );

        $this->assertSame(1, (int) $stay['persons']);

        // Database stays table verification
        $stmt = $this->db->prepare("SELECT persons FROM stays WHERE id = :id");
        $stmt->execute(['id' => $stay['id']]);
        $this->assertSame(1, (int) $stmt->fetchColumn());

        // Rooms API response verification
        $roomsDataAfter = $this->roomService->listRooms(self::HOTEL_ID);
        $room201After = $this->findRoomInList($roomsDataAfter['rooms'], 201);
        $this->assertSame('occupied', $room201After['status']);
        $this->assertSame(1, $room201After['persons']);
        $this->assertSame('Priya Sharma', $room201After['guestName']);
    }

    /**
     * Test Case 4 & 5: Refresh Rooms page, navigate away and return -> correct count remains.
     */
    public function testCase4And5PageRefreshAndNavigationPersistence(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Check in Room 101 with 2 persons
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room101Id,
            '9876543240',
            'Ananya',
            $today,
            $tomorrow,
            2,
            1500.00,
            500.00,
            'cash',
            1
        );

        $this->stayService->checkInFromReservation(
            (int) $booking['id'],
            self::HOTEL_ID,
            1,
            2,
            [],
            [],
            [
                ['name' => 'Ananya', 'gender' => 'Female', 'phone' => '9876543240'],
                ['name' => 'Deepak', 'gender' => 'Male', 'phone' => '9876543241'],
            ],
            false
        );

        // Simulate multiple subsequent fetch calls (page refresh / navigate away & return)
        for ($i = 1; $i <= 3; $i++) {
            $data = $this->roomService->listRooms(self::HOTEL_ID);
            $room = $this->findRoomInList($data['rooms'], 101);
            $this->assertSame('occupied', $room['status']);
            $this->assertSame(2, $room['persons'], "Assertion failed on iteration {$i}");
            $this->assertSame('Ananya', $room['guestName']);
        }
    }

    /**
     * Test Case 6: Multiple floors and different room types.
     */
    public function testCase6MultipleFloorsAndDifferentRoomTypes(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Floor 1 (Standard): 2 Persons
        $b1 = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543251', 'Guest Floor 1', $today, $tomorrow, 2, 1500.00, 500.00, 'cash', 1
        );
        $this->stayService->checkInFromReservation(
            (int) $b1['id'], self::HOTEL_ID, 1, 2, [], [],
            [
                ['name' => 'Guest Floor 1', 'gender' => 'Female', 'phone' => '9876543251'],
                ['name' => 'Floor 1 Second', 'gender' => 'Male', 'phone' => '9876543252'],
            ],
            false
        );

        // Floor 2 (Deluxe): 1 Person
        $b2 = $this->reservationService->create(
            self::HOTEL_ID, $this->room201Id, '9876543261', 'Guest Floor 2', $today, $tomorrow, 2, 2500.00, 500.00, 'cash', 1
        );
        $this->stayService->checkInFromReservation(
            (int) $b2['id'], self::HOTEL_ID, 1, 1, [], [],
            [
                ['name' => 'Guest Floor 2', 'gender' => 'Male', 'phone' => '9876543261'],
            ],
            false
        );

        // Floor 3 (Suite): 3 Persons
        $b3 = $this->reservationService->create(
            self::HOTEL_ID, $this->room301Id, '9876543271', 'Guest Floor 3', $today, $tomorrow, 3, 4000.00, 1000.00, 'cash', 1
        );
        $this->stayService->checkInFromReservation(
            (int) $b3['id'], self::HOTEL_ID, 1, 3, [], [],
            [
                ['name' => 'Guest Floor 3', 'gender' => 'Female', 'phone' => '9876543271'],
                ['name' => 'Floor 3 Sec', 'gender' => 'Female', 'phone' => '9876543272'],
                ['name' => 'Floor 3 Third', 'gender' => 'Male', 'phone' => '9876543273'],
            ],
            false
        );

        // Floor 4 (Family): 4 Persons via Direct Check-In
        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room401Id,
            '9876543281',
            'Guest Floor 4',
            'Aadhaar',
            '444455556666',
            'Bangalore',
            4,
            1,
            6000.00,
            1000.00,
            'cash',
            1,
            '12:00:00',
            'Walk-in',
            null,
            null,
            [],
            [],
            [
                ['name' => 'Guest Floor 4', 'gender' => 'Male', 'phone' => '9876543281'],
                ['name' => 'Floor 4 Sec', 'gender' => 'Female', 'phone' => '9876543282'],
                ['name' => 'Floor 4 Third', 'gender' => 'Female', 'phone' => '9876543283'],
                ['name' => 'Floor 4 Fourth', 'gender' => 'Male', 'phone' => '9876543284'],
            ]
        );

        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r101 = $this->findRoomInList($roomsData['rooms'], 101);
        $r201 = $this->findRoomInList($roomsData['rooms'], 201);
        $r301 = $this->findRoomInList($roomsData['rooms'], 301);
        $r401 = $this->findRoomInList($roomsData['rooms'], 401);

        $this->assertSame(1, $r101['floor']);
        $this->assertSame('Standard Room', $r101['roomType']['name']);
        $this->assertSame(2, $r101['persons']);

        $this->assertSame(2, $r201['floor']);
        $this->assertSame('Deluxe Room', $r201['roomType']['name']);
        $this->assertSame(1, $r201['persons']);

        $this->assertSame(3, $r301['floor']);
        $this->assertSame('Suite Room', $r301['roomType']['name']);
        $this->assertSame(3, $r301['persons']);

        $this->assertSame(4, $r401['floor']);
        $this->assertSame('Family Suite', $r401['roomType']['name']);
        $this->assertSame(4, $r401['persons']);
    }

    /**
     * Test Case 7: Checkout and subsequent new booking do not display previous guest's persons count.
     */
    public function testCase7CheckoutAndSubsequentNewBookingDoesNotDisplayPreviousGuestPersonsCount(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // 1. Initial booking and check-in for 2 persons
        $b1 = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543291', 'Old Guest', $today, $tomorrow, 2, 1500.00, 500.00, 'cash', 1
        );
        $stay = $this->stayService->checkInFromReservation(
            (int) $b1['id'], self::HOTEL_ID, 1, 2, [], [],
            [
                ['name' => 'Old Guest', 'gender' => 'Male', 'phone' => '9876543291'],
                ['name' => 'Old Companion', 'gender' => 'Female', 'phone' => '9876543292'],
            ],
            false
        );

        $this->assertSame(2, (int) $stay['persons']);

        // Check active stay
        $rOcc = $this->findRoomInList($this->roomService->listRooms(self::HOTEL_ID)['rooms'], 101);
        $this->assertSame('occupied', $rOcc['status']);
        $this->assertSame(2, $rOcc['persons']);

        // 2. Perform Checkout
        $this->stayService->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1);

        // 3. Room is now cleaning: must NOT show old stay's 2 persons, must be 0
        $rCleaning = $this->findRoomInList($this->roomService->listRooms(self::HOTEL_ID)['rooms'], 101);
        $this->assertSame('cleaning', $rCleaning['status']);
        $this->assertSame(0, $rCleaning['persons'], 'Cleaning room must not show previous stay persons count');

        // 4. Mark room ready (housekeeping)
        $this->roomService->setHousekeeping($this->room101Id, 'ready', null, 1, self::HOTEL_ID);

        $rReady = $this->findRoomInList($this->roomService->listRooms(self::HOTEL_ID)['rooms'], 101);
        $this->assertSame('free', $rReady['status']);
        $this->assertSame(0, $rReady['persons'], 'Ready room must show 0 persons');

        // 5. Subsequent new booking for 1 person
        $nextDayIn = date('Y-m-d', strtotime('+3 days'));
        $nextDayOut = date('Y-m-d', strtotime('+4 days'));

        $b2 = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543299', 'New Solo Guest', $nextDayIn, $nextDayOut, 1, 1500.00, 500.00, 'cash', 1
        );

        $rBooked = $this->findRoomInList($this->roomService->listRooms(self::HOTEL_ID)['rooms'], 101);
        $this->assertSame('booked', $rBooked['status']);
        $this->assertSame(1, $rBooked['persons'], 'Booked room must display the new reservation persons count (1), NOT the previous stay (2)');
        $this->assertSame('New Solo Guest', $rBooked['guestName']);
    }

    private function findRoomInList(array $rooms, int $roomNo): array
    {
        foreach ($rooms as $r) {
            if ((int) $r['roomNo'] === $roomNo) {
                return $r;
            }
        }
        $this->fail("Room {$roomNo} not found in room list response.");
    }
}
