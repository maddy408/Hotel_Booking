<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayRepository;
use App\Service\AvailabilityService;
use App\Service\RoomService;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * End-to-end verification of all 8 scenarios specified by user for 24 November 2026.
 */
final class ScenarioVerificationTest extends TestCase
{
    private const HOTEL_ID = 994;
    private PDO $db;
    private RoomService $roomService;
    private AvailabilityService $availabilityService;
    private RoomRepository $roomRepo;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private SettingsRepository $settingsRepo;

    private int $roomId;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Scenario Hotel', 'Madurai')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'SCN', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9941, " . self::HOTEL_ID . ", 'STD', 'Standard', 2200.00, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99401, " . self::HOTEL_ID . ", 101, 1, 9941, 'ok')");
        $this->roomId = 99401;

        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (99401, " . self::HOTEL_ID . ", 'Test Guest', '9998887777', 'Aadhaar', '4321')");
        $this->guestId = 99401;

        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);

        $hkRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));

        $this->roomService = new RoomService(
            $this->roomRepo,
            new RoomTypeRepository($this->db),
            $hkRepo,
            $audit,
            $this->settingsRepo
        );

        $this->availabilityService = new AvailabilityService(
            $this->reservationRepo,
            $this->stayRepo,
            $this->settingsRepo
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /**
     * Scenario 1: Booking 21–22 Nov, guest checked out -> Room available if Ready.
     */
    public function testScenario1_BookingPastCheckedOut_RoomAvailableIfReady(): void
    {
        $this->db->exec(
            "INSERT INTO reservations (id, hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, rate, status)
             VALUES (99401, " . self::HOTEL_ID . ", 'BK-SC1', {$this->roomId}, {$this->guestId}, '2026-11-21', '2026-11-22', 2200.00, 'checked_out')"
        );
        $this->db->exec(
            "INSERT INTO stays (id, hotel_id, reservation_id, room_id, guest_id, rate, check_in_date, checkout_planned, checkout_actual, status)
             VALUES (99401, " . self::HOTEL_ID . ", 99401, {$this->roomId}, {$this->guestId}, 2200.00, '2026-11-21', '2026-11-22', '2026-11-22', 'checked_out')"
        );

        $this->roomRepo->updateHousekeeping($this->roomId, 'ok', null);

        // Room is free for today (2026-11-24 to 2026-11-25)
        $isFree = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-25', null, null, self::HOTEL_ID);
        $this->assertTrue($isFree, 'Past checked-out stay must not block today');

        $freeRooms = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertCount(1, $freeRooms);
        $this->assertTrue($freeRooms[0]['is_bookable']);
        $this->assertSame('ok', $freeRooms[0]['housekeeping_status']);
    }

    /**
     * Scenario 2: Booking 21–22 Nov, guest never checked in -> Room available if Ready.
     */
    public function testScenario2_BookingPastNeverCheckedIn_RoomAvailableIfReady(): void
    {
        // Reservation stayed 'pending' (or 'no_show') but dates are 21-22 Nov
        $this->db->exec(
            "INSERT INTO reservations (id, hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, rate, status)
             VALUES (99402, " . self::HOTEL_ID . ", 'BK-SC2', {$this->roomId}, {$this->guestId}, '2026-11-21', '2026-11-22', 2200.00, 'pending')"
        );

        $this->roomRepo->updateHousekeeping($this->roomId, 'ok', null);

        // Past booking does not overlap today 2026-11-24
        $isFree = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-25', null, null, self::HOTEL_ID);
        $this->assertTrue($isFree, 'Past pending booking from 21-22 Nov must not block 24 Nov availability');

        // Check RoomService listRooms
        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $room = $data['rooms'][0];
        $this->assertFalse($room['hasConflict'], 'Past booking must not show as conflict');
        $this->assertNotSame('2026-11-21', $room['nextBookingDate'], 'Past booking date must not be nextBookingDate');
    }

    /**
     * Scenario 3: Stay 21–22 Nov, guest still checked in -> Room remains Occupied.
     */
    public function testScenario3_StayPastStillCheckedIn_RoomRemainsOccupied(): void
    {
        $this->db->exec(
            "INSERT INTO stays (id, hotel_id, room_id, guest_id, rate, check_in_date, checkout_planned, status)
             VALUES (99403, " . self::HOTEL_ID . ", {$this->roomId}, {$this->guestId}, 2200.00, '2026-11-21', '2026-11-22', 'in_house')"
        );

        // Room is NOT free today because guest is still in-house
        $isFree = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-25', null, null, self::HOTEL_ID);
        $this->assertFalse($isFree, 'In-house stay from 21 Nov with overdue checkout must block availability');

        $data = $this->roomService->listRooms(self::HOTEL_ID);
        $room = $data['rooms'][0];
        $this->assertSame('occupied', $room['status']);
        $this->assertTrue($room['isOverdue']);
        $this->assertSame(1, $data['counts']['occupied']);
    }

    /**
     * Scenario 4: Booking 24–25 Nov -> Room unavailable for overlapping walk-in dates.
     */
    public function testScenario4_BookingToday_RoomUnavailableForOverlap(): void
    {
        $this->db->exec(
            "INSERT INTO reservations (id, hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, rate, status)
             VALUES (99404, " . self::HOTEL_ID . ", 'BK-SC4', {$this->roomId}, {$this->guestId}, '2026-11-24', '2026-11-25', 2200.00, 'pending')"
        );

        $isFree = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-25', null, null, self::HOTEL_ID);
        $this->assertFalse($isFree, 'Room must be unavailable when an active booking overlaps 24-25 Nov');

        $freeRooms = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertCount(1, $freeRooms);
        $this->assertFalse($freeRooms[0]['is_bookable']);
        $this->assertSame('unavailable', $freeRooms[0]['booking_status']);
    }

    /**
     * Scenario 5: Booking 25–26 Nov -> Room can be available for a stay ending on 25 Nov.
     */
    public function testScenario5_BookingTomorrow_RoomAvailableForStayEndingTomorrow(): void
    {
        $this->db->exec(
            "INSERT INTO reservations (id, hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, rate, status)
             VALUES (99405, " . self::HOTEL_ID . ", 'BK-SC5', {$this->roomId}, {$this->guestId}, '2026-11-25', '2026-11-26', 2200.00, 'pending')"
        );

        // Walk-in for 1 night from 24 Nov to 25 Nov (ends when tomorrow's booking arrives)
        $isFree = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-25', null, null, self::HOTEL_ID);
        $this->assertTrue($isFree, 'Stay ending on 25 Nov does not overlap booking starting on 25 Nov');

        // But walk-in for 2 nights (24 Nov to 26 Nov) must be blocked
        $isFree2Nights = $this->availabilityService->isFree($this->roomId, '2026-11-24', '2026-11-26', null, null, self::HOTEL_ID);
        $this->assertFalse($isFree2Nights, 'Stay 24-26 Nov must be blocked because it overlaps 25-26 Nov');
    }

    /**
     * Scenario 6: Room in Cleaning -> Not available.
     */
    public function testScenario6_RoomInCleaning_NotAvailable(): void
    {
        $this->roomRepo->updateHousekeeping($this->roomId, 'cleaning', 'Turnover cleaning');

        $freeRooms = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertCount(1, $freeRooms);
        $this->assertFalse($freeRooms[0]['is_bookable']);
        $this->assertFalse($freeRooms[0]['is_ready']);
        $this->assertSame('cleaning', $freeRooms[0]['housekeeping_status']);
    }

    /**
     * Scenario 7: Room in Repair -> Not available.
     */
    public function testScenario7_RoomInRepair_NotAvailable(): void
    {
        $this->roomRepo->updateHousekeeping($this->roomId, 'repair', 'AC maintenance');

        $freeRooms = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertCount(1, $freeRooms);
        $this->assertFalse($freeRooms[0]['is_bookable']);
        $this->assertFalse($freeRooms[0]['is_ready']);
        $this->assertSame('repair', $freeRooms[0]['housekeeping_status']);
    }

    /**
     * Scenario 8: Previous guest checked out and room marked Ready -> Available again.
     */
    public function testScenario8_PreviousGuestCheckedOutAndRoomMarkedReady_AvailableAgain(): void
    {
        // 1. Previous guest checks out
        $this->db->exec(
            "INSERT INTO stays (id, hotel_id, room_id, guest_id, rate, check_in_date, checkout_planned, checkout_actual, status)
             VALUES (99408, " . self::HOTEL_ID . ", {$this->roomId}, {$this->guestId}, 2200.00, '2026-11-20', '2026-11-24', '2026-11-24', 'checked_out')"
        );

        // 2. Room is initially in cleaning
        $this->roomRepo->updateHousekeeping($this->roomId, 'cleaning', 'Post-checkout cleaning');
        $freeRoomsCleaning = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertFalse($freeRoomsCleaning[0]['is_bookable'], 'Not bookable while in cleaning');

        // 3. Housekeeping marks room Ready (ok)
        $this->roomRepo->updateHousekeeping($this->roomId, 'ok', 'Housekeeping completed');
        $freeRoomsReady = $this->availabilityService->freeRooms($this->roomRepo, self::HOTEL_ID, '2026-11-24', '2026-11-25');
        $this->assertTrue($freeRoomsReady[0]['is_bookable'], 'Available again after checkout and housekeeping marks Ready');
        $this->assertTrue($freeRoomsReady[0]['is_ready']);
    }
}
