<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Service\RoomService;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class RoomActiveBookingStatusTest extends TestCase
{
    private const HOTEL_ID = 993;
    private PDO $db;
    private RoomService $roomService;
    private int $room101Id;
    private int $room102Id;
    private int $room103Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test Hotel 993', 'Chennai')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'BKD993', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9931, " . self::HOTEL_ID . ", 'STD', 'Standard', 2200.00, 2)");

        // Room 101, 102, 103
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99301, " . self::HOTEL_ID . ", 101, 1, 9931, 'ok')");
        $this->room101Id = 99301;
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99302, " . self::HOTEL_ID . ", 102, 1, 9931, 'ok')");
        $this->room102Id = 99302;
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99303, " . self::HOTEL_ID . ", 103, 1, 9931, 'ok')");
        $this->room103Id = 99303;

        // Guest: Ramya
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (99301, " . self::HOTEL_ID . ", 'Ramya', '9876543210', 'Aadhaar', '1234')");
        $this->guestId = 99301;

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));

        $this->roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $audit);
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    public function testActualHotel1RamyaReservationAppearsInBookedRooms(): void
    {
        // Tests the real record in MySQL Hotel 1 without modifying anything
        $data = $this->roomService->listRooms(1);

        $r101 = null;
        $bookedRoom = null;
        foreach ($data['rooms'] as $r) {
            if ($r['roomNo'] === 101) {
                $r101 = $r;
            }
            if ($r['status'] === 'booked') {
                $bookedRoom = $r;
            }
        }

        $this->assertNotNull($r101, 'Room 101 must exist in Hotel 1');
        // If Room 101 has an active in-house stay, in-house stay takes priority over booked
        if ($r101['stayId'] !== null) {
            $this->assertSame('occupied', $r101['status']);
        } else {
            $this->assertSame('booked', $r101['status']);
        }
        $this->assertNotNull($bookedRoom, 'At least one room must appear as booked in Hotel 1');
        $this->assertSame('booked', $bookedRoom['status']);
        $this->assertGreaterThanOrEqual(1, $data['counts']['booked']);
    }

    public function testFutureBookingsTomorrowNextWeekNextMonthAppearInBooked(): void
    {
        // Booking tomorrow (2026-11-08) on Room 101
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, advance_method, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-TMRW', {$this->room101Id}, {$this->guestId}, '2026-11-08', '2026-11-10', 2, 2200.00, 200.00, 'cash', 'pending')"
        );

        // Booking next week (2026-11-15) on Room 102
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, advance_method, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-NXWK', {$this->room102Id}, {$this->guestId}, '2026-11-15', '2026-11-17', 2, 2200.00, 500.00, 'cash', 'pending')"
        );

        // Booking next month (2026-12-10) on Room 103
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, advance_method, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-NXMO', {$this->room103Id}, {$this->guestId}, '2026-12-10', '2026-12-12', 2, 2200.00, 0.00, 'cash', 'pending')"
        );

        $data = $this->roomService->listRooms(self::HOTEL_ID);

        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        $this->assertSame('booked', $byNo[101]['status'], 'Tomorrow booking must appear as booked');
        $this->assertSame('BK-TMRW', $byNo[101]['bookingCode']);

        $this->assertSame('booked', $byNo[102]['status'], 'Next week booking must appear as booked');
        $this->assertSame('BK-NXWK', $byNo[102]['bookingCode']);

        $this->assertSame('booked', $byNo[103]['status'], 'Next month booking must appear as booked');
        $this->assertSame('BK-NXMO', $byNo[103]['bookingCode']);

        $this->assertSame(3, $data['counts']['booked']);
    }

    public function testCancelledAndNoShowReservationsDoNotAppearInBooked(): void
    {
        // Cancelled booking on Room 101
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-CANC', {$this->room101Id}, {$this->guestId}, '2026-11-08', '2026-11-10', 2, 2200.00, 'cancelled')"
        );

        // No-show booking on Room 102
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-NOSH', {$this->room102Id}, {$this->guestId}, '2026-11-05', '2026-11-07', 2, 2200.00, 'no_show')"
        );

        $data = $this->roomService->listRooms(self::HOTEL_ID);

        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        $this->assertSame('free', $byNo[101]['status'], 'Cancelled booking must not make room booked');
        $this->assertSame('free', $byNo[102]['status'], 'No-show booking must not make room booked');
        $this->assertSame(0, $data['counts']['booked']);
    }

    public function testCheckedInGuestIsOccupiedNotBooked(): void
    {
        // Insert active in-house stay on Room 101
        $this->db->exec(
            "INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
             VALUES (" . self::HOTEL_ID . ", {$this->room101Id}, {$this->guestId}, 2, 2200.00, '" . date('Y-m-d') . "', '" . date('Y-m-d', strtotime('+1 day')) . "', 'in_house')"
        );

        // Also insert an active pending reservation on Room 101
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-NEXT', {$this->room101Id}, {$this->guestId}, '2026-11-15', '2026-11-17', 2, 2200.00, 'pending')"
        );

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        // Occupied takes priority
        $this->assertSame('occupied', $byNo[101]['status']);
        $this->assertSame(1, $data['counts']['occupied']);
        $this->assertSame(0, $data['counts']['booked']);
        $this->assertSame('2026-11-15', $byNo[101]['nextBookingDate']);
    }

    public function testBookedRoomsPreserveHousekeepingStatusIndependently(): void
    {
        // Room 101: ok (Ready) + Booking
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-RDY', {$this->room101Id}, {$this->guestId}, '2026-11-08', '2026-11-10', 2, 2200.00, 'pending')"
        );

        // Room 102: cleaning + Booking
        $this->db->exec("UPDATE rooms SET housekeeping_status = 'cleaning' WHERE id = {$this->room102Id}");
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-CLN', {$this->room102Id}, {$this->guestId}, '2026-11-08', '2026-11-10', 2, 2200.00, 'pending')"
        );

        // Room 103: repair + Booking
        $this->db->exec("UPDATE rooms SET housekeeping_status = 'repair', note = 'AC under maintenance' WHERE id = {$this->room103Id}");
        $this->db->exec(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, status)
             VALUES (" . self::HOTEL_ID . ", 'BK-RPR', {$this->room103Id}, {$this->guestId}, '2026-11-08', '2026-11-10', 2, 2200.00, 'pending')"
        );

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        // Room 101: Booked + Ready
        $this->assertSame('booked', $byNo[101]['status']);
        $this->assertSame('ok', $byNo[101]['housekeepingStatus']);
        $this->assertTrue($byNo[101]['isReady']);

        // Room 102: Booked + Cleaning (not ready for check-in)
        $this->assertSame('booked', $byNo[102]['status']);
        $this->assertSame('cleaning', $byNo[102]['housekeepingStatus']);
        $this->assertFalse($byNo[102]['isReady']);

        // Room 103: Booked + Repair (not ready for check-in)
        $this->assertSame('booked', $byNo[103]['status']);
        $this->assertSame('repair', $byNo[103]['housekeepingStatus']);
        $this->assertFalse($byNo[103]['isReady']);

        // Total Booked count includes all 3
        $this->assertSame(3, $data['counts']['booked']);
        $this->assertSame(0, $data['counts']['cleaning']);
        $this->assertSame(0, $data['counts']['repair']);
    }
}
