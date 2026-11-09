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
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

/**
 * Complete, isolated Hotel Booking & Room Availability Integration Test Suite.
 * Covers all scenarios from the Comprehensive Hotel Booking & Room Availability Testing Specification.
 * Operates on an isolated test hotel (ID: 998) to ensure zero impact on production or existing test records.
 */
final class ComprehensiveHotelBookingSuiteTest extends TestCase
{
    private const HOTEL_ID = 899;
    private const ROOM_STD_1 = 89901; // Room 901 (Standard, max 2)
    private const ROOM_STD_2 = 89902; // Room 902 (Standard, max 2)
    private const ROOM_STE_1 = 89903; // Room 903 (Suite, max 4)
    private const ROOM_CLN_1 = 89904; // Room 904 (Cleaning)
    private const ROOM_REP_1 = 89905; // Room 905 (Repair/Maintenance)

    private const GUEST_A = 89911;
    private const GUEST_B = 89912;

    private PDO $db;
    private ReservationService $reservations;
    private StayService $stays;
    private RoomService $roomService;
    private AvailabilityService $availability;
    private PaymentRepository $payments;
    private RoomRepository $rooms;
    private GuestService $guests;
    private SettingsRepository $settings;
    private HousekeepingLogRepository $hkLogs;
    private GstService $gst;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // 1. Isolated Hotel & Settings
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test Hotel Tamarind', 'Goa')");
        $this->db->exec(
            "INSERT INTO settings (hotel_id, invoice_prefix, booking_prefix, checkout_hour, timezone, gst_slab1_max_rate, gst_slab1_gst_rate, gst_slab2_max_rate, gst_slab2_gst_rate, gst_slab3_gst_rate, cancellation_deadline_hours, cancellation_free_allowed, cancellation_fee_type, cancellation_fee_value, cancellation_late_fee_type, cancellation_late_fee_value)
             VALUES (" . self::HOTEL_ID . ", 'TESTINV', 'TESTBK', 12, 'Asia/Kolkata', 1000.00, 0.0000, 7500.00, 0.0500, 0.1800, 24, 1, 'none', 0.00, 'percentage', 10.00)"
        );

        // 2. Room Types: Standard (2200/night, max 2), Suite (8000/night, max 4)
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (8991, " . self::HOTEL_ID . ", 'T_STD', 'Test Standard', 2200.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (8992, " . self::HOTEL_ID . ", 'T_STE', 'Test Suite', 8000.00, 4)");

        // 3. Rooms
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (" . self::ROOM_STD_1 . ", " . self::HOTEL_ID . ", 901, 9, 8991, 'ok')");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (" . self::ROOM_STD_2 . ", " . self::HOTEL_ID . ", 902, 9, 8991, 'ok')");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (" . self::ROOM_STE_1 . ", " . self::HOTEL_ID . ", 903, 9, 8992, 'ok')");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (" . self::ROOM_CLN_1 . ", " . self::HOTEL_ID . ", 904, 9, 8991, 'cleaning')");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status, note) VALUES (" . self::ROOM_REP_1 . ", " . self::HOTEL_ID . ", 905, 9, 8991, 'repair', 'AC compressor replacement')");

        // 4. Seeded Guests
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4, city) VALUES (" . self::GUEST_A . ", " . self::HOTEL_ID . ", 'Aarav Sharma', '9876500001', 'Aadhaar', '1234', 'Mumbai')");
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4, city) VALUES (" . self::GUEST_B . ", " . self::HOTEL_ID . ", 'Diya Patel', '9876500002', 'Passport', '5678', 'Ahmedabad')");

        // Repositories & Services
        $resRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $this->rooms = new RoomRepository($this->db);
        $guestRepo = new GuestRepository($this->db);
        $this->guests = new GuestService($guestRepo);
        $this->availability = new AvailabilityService($resRepo, $stayRepo);
        $this->payments = new PaymentRepository($this->db);
        $this->settings = new SettingsRepository($this->db);
        $this->hkLogs = new HousekeepingLogRepository($this->db);
        $this->gst = new GstService($this->settings);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $stayChargeRepo = new StayChargeRepository($this->db);
        $invoiceRepo = new InvoiceRepository($this->db);
        $invoiceService = new InvoiceService($this->db, $invoiceRepo, $this->settings, $audit);
        $billingService = new BillingService($this->gst, $stayChargeRepo, $this->payments, $this->settings);

        $this->reservations = new ReservationService(
            $this->db, $resRepo, $this->rooms, $this->guests, $this->availability,
            $this->payments, $this->settings, $audit, $stayRepo
        );

        $this->stays = new StayService(
            $this->db, $stayRepo, $resRepo, $this->rooms, $stayChargeRepo, $this->payments,
            $this->hkLogs, $this->settings, $this->guests, $this->availability,
            $billingService, $invoiceService, $audit
        );

        $this->roomService = new RoomService($this->rooms, $roomTypeRepo, $this->hkLogs, $audit);
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stay_charges WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (" . self::ROOM_STD_1 . ", " . self::ROOM_STD_2 . ", " . self::ROOM_STE_1 . ", " . self::ROOM_CLN_1 . ", " . self::ROOM_REP_1 . ")");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    // =========================================================================
    // SECTION 1: CREATE BOOKING – BASIC TESTS
    // =========================================================================

    public function test01_CreateBookingWithAllValidInformation(): void
    {
        $today = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $booking = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, $checkOut, 2, 2200.00, 500.00, 'upi', 1
        );

        $this->assertNotEmpty($booking);
        $this->assertStringStartsWith('TESTBK-', $booking['booking_code']);
        $this->assertSame(self::ROOM_STD_1, (int) $booking['room_id']);
        $this->assertSame(901, (int) $booking['room_no']);
        $this->assertSame('Aarav Sharma', $booking['guest_name']);
        $this->assertSame('9876500001', $booking['guest_phone']);
        $this->assertSame($today, $booking['check_in_date']);
        $this->assertSame($checkOut, $booking['check_out_date']);
        $this->assertSame(2, (int) $booking['persons']);
        $this->assertEquals(2200.00, (float) $booking['rate']);
        $this->assertEquals(500.00, (float) $booking['advance_amount']);
        $this->assertSame('upi', $booking['advance_method']);
        $this->assertSame('pending', $booking['status']);

        // Nights & GST
        $nights = BillingService::nightsBetween($today, $checkOut);
        $this->assertSame(2, $nights);
        $gstInfo = $this->gst->slabFor(self::HOTEL_ID, 2200.00);
        $this->assertSame(0.05, $gstInfo['rate']);

        // Payment record check
        $payments = $this->payments->forReservation((int) $booking['id']);
        $this->assertCount(1, $payments);
        $this->assertEquals(500.00, (float) $payments[0]['amount']);
        $this->assertSame('upi', $payments[0]['method']);
        $this->assertSame('successful', $payments[0]['status']);
    }

    public function test02_CreateBookingForOnePerson(): void
    {
        $today = date('Y-m-d');
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 1, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(1, (int) $b['persons']);
    }

    public function test03_CreateBookingForTwoPersons(): void
    {
        $today = date('Y-m-d');
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(2, (int) $b['persons']);
    }

    public function test04_CreateBookingForMaximumRoomCapacity(): void
    {
        $today = date('Y-m-d');
        // Suite max_persons is 4
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STE_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 4, 8000.00, 0.00, 'cash', 1
        );
        $this->assertSame(4, (int) $b['persons']);
    }

    public function test05_CreateBookingForMultipleNights(): void
    {
        $today = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+5 days'));
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, $checkOut, 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(5, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    public function test06_CreateBookingForOneNight(): void
    {
        $today = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+1 day'));
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, $checkOut, 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(1, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    public function test07_CreateBookingForMultipleRoomsOnSameDates(): void
    {
        $today = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, $checkOut, 2, 2200.00, 0.00, 'cash', 1
        );
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_2, '9876500001', 'Aarav Sharma',
            $today, $checkOut, 2, 2200.00, 0.00, 'cash', 1
        );

        $this->assertNotSame($b1['id'], $b2['id']);
        $this->assertSame(self::ROOM_STD_1, (int) $b1['room_id']);
        $this->assertSame(self::ROOM_STD_2, (int) $b2['room_id']);
    }

    public function test08_CreateBookingForExistingGuestReusesGuestRecord(): void
    {
        $initialCount = (int) $this->db->query("SELECT COUNT(*) FROM guests WHERE hotel_id = " . self::HOTEL_ID)->fetchColumn();
        $today = date('Y-m-d');

        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma Updated',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );

        $finalCount = (int) $this->db->query("SELECT COUNT(*) FROM guests WHERE hotel_id = " . self::HOTEL_ID)->fetchColumn();
        $this->assertSame($initialCount, $finalCount, 'No duplicate guest record should be created for an existing phone');
        $this->assertSame(self::GUEST_A, (int) $b['guest_id']);
    }

    public function test09_CreateBookingForNewGuestCreatesMinimalGuestRecord(): void
    {
        $today = date('Y-m-d');
        $newPhone = '9991234567';

        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, $newPhone, 'New Guest Name',
            $today, date('Y-m-d', strtotime('+1 day')), 1, 2200.00, 0.00, 'cash', 1
        );

        $this->assertNotEmpty($b['guest_id']);
        $newGuest = $this->guests->findByPhone(self::HOTEL_ID, $newPhone);
        $this->assertNotNull($newGuest);
        $this->assertSame('New Guest Name', $newGuest['name']);
    }

    public function test10_CreateMultipleBookingsForSameGuest(): void
    {
        $today = date('Y-m-d');
        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            date('Y-m-d', strtotime('+5 days')), date('Y-m-d', strtotime('+7 days')), 2, 2200.00, 0.00, 'cash', 1
        );

        $this->assertSame((int) $b1['guest_id'], (int) $b2['guest_id']);
        $this->assertNotSame((int) $b1['id'], (int) $b2['id']);
    }

    public function test11_CreateBookingsForDifferentDatesInSameRoom(): void
    {
        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-20', '2026-11-22', 2, 2200.00, 0.00, 'cash', 1
        );
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Diya Patel',
            '2026-11-25', '2026-11-27', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->assertSame('pending', $b1['status']);
        $this->assertSame('pending', $b2['status']);
    }

    // =========================================================================
    // SECTION 2: DATE VALIDATION TESTS
    // =========================================================================

    public function test13_CheckInDateTodaySucceeds(): void
    {
        $today = date('Y-m-d');
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame($today, $b['check_in_date']);
    }

    public function test14_CheckInDateTomorrowSucceeds(): void
    {
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $tomorrow, date('Y-m-d', strtotime('+2 days')), 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame($tomorrow, $b['check_in_date']);
    }

    public function test15_CheckInDateNextWeekSucceeds(): void
    {
        $nextWeek = date('Y-m-d', strtotime('+7 days'));
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $nextWeek, date('Y-m-d', strtotime('+9 days')), 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame($nextWeek, $b['check_in_date']);
    }

    public function test16_CheckInDateNextMonthSucceeds(): void
    {
        $nextMonth = date('Y-m-d', strtotime('+30 days'));
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $nextMonth, date('Y-m-d', strtotime('+32 days')), 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame($nextMonth, $b['check_in_date']);
    }

    public function test17_CheckInDateInPastRejected(): void
    {
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Check-in date cannot be in the past.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $yesterday, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test18_CheckOutDateBeforeCheckInRejected(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Checkout date must be after check-in date.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-20', '2026-11-19', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test19_CheckOutDateSameAsCheckInRejectedZeroNights(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Checkout date must be after check-in date.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-20', '2026-11-20', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test20_BookingDurationCrossesMonth(): void
    {
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-29', '2026-12-03', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(4, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    public function test21_BookingDurationCrossesYear(): void
    {
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-12-30', '2027-01-03', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(4, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    public function test22_LeapYearHandling(): void
    {
        // 2028 is a leap year (Feb 29 exists)
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2028-02-28', '2028-03-01', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(2, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    public function test23_ExtremelyLongBookingDuration(): void
    {
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-10', '2027-11-10', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame(365, BillingService::nightsBetween($b['check_in_date'], $b['check_out_date']));
    }

    // =========================================================================
    // SECTION 3: ROOM AVAILABILITY TESTS
    // =========================================================================

    public function test25_SameRoomSameDatesRejected(): void
    {
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test26_SameRoomOverlappingDatesRejected(): void
    {
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-16', '2026-11-19', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test27_PartialOverlapRejected(): void
    {
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-20', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-18', '2026-11-22', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test28_ContainedInsideAnotherBookingRejected(): void
    {
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-25', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-18', '2026-11-20', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test29_ConsecutiveBookingsAllowedHalfOpenInterval(): void
    {
        // Booking A: Nov 15–18. Booking B: Nov 18–21 (12 noon turnover on Nov 18).
        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-18', '2026-11-21', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->assertSame('pending', $b1['status']);
        $this->assertSame('pending', $b2['status']);
        $this->assertTrue($this->availability->isFree(self::ROOM_STD_1, '2026-11-21', '2026-11-23'));
    }

    public function test30_DifferentRoomsSameDatesAllowed(): void
    {
        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_2, '9876500002', 'Booking B',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );

        $this->assertSame('pending', $b1['status']);
        $this->assertSame('pending', $b2['status']);
    }

    public function test31_CancelledReservationFreesAvailability(): void
    {
        $b1 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Booking A',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->reservations->cancel((int) $b1['id'], self::HOTEL_ID, 'Guest plans changed', 0.0, 'cash', 1);

        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Booking B',
            '2026-11-15', '2026-11-18', 2, 2200.00, 0.00, 'cash', 1
        );
        $this->assertSame('pending', $b2['status']);
    }

    public function test32_NoShowReservationFreesAvailability(): void
    {
        // Directly insert an overdue reservation in the past for this test
        $this->db->prepare(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (" . self::HOTEL_ID . ", 'BK-NOSHOW-TEST', " . self::ROOM_STD_1 . ", " . self::GUEST_A . ", '2026-10-01', '2026-10-05', 'pending', 2200.00)"
        )->execute();
        $resId = (int) $this->db->lastInsertId();

        // Mark no-show
        $this->reservations->markNoShow($resId, self::HOTEL_ID, 1);

        // Room is free for future booking
        $this->assertTrue($this->availability->isFree(self::ROOM_STD_1, '2026-11-15', '2026-11-18'));
    }

    public function test33_ActiveInHouseStayBlocksConflictingBooking(): void
    {
        $today = date('Y-m-d');
        $checkoutPlanned = date('Y-m-d', strtotime('+3 days'));

        $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Direct InHouse Guest',
            'Aadhaar', '123456789012', 'Delhi', 2, 3, 2200.00, 1000.00, 'cash', 1
        );

        // Try booking overlapping with this active in-house stay
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('already occupied by another active stay');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Overlapping Booker',
            $today, $checkoutPlanned, 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test34_ConcurrentBookingRaceConditionProtectedByRowLockAndTrigger(): void
    {
        // Trigger trg_reservations_prevent_overlap_insert prevents double insertion even if direct SQL bypasses service
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+2 days'));

        $this->db->prepare(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (" . self::HOTEL_ID . ", 'BK-RACE-1', " . self::ROOM_STD_1 . ", " . self::GUEST_A . ", :cin, :cout, 'pending', 2200.00)"
        )->execute(['cin' => $today, 'cout' => $tomorrow]);

        $this->expectException(PDOException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->db->prepare(
            "INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (" . self::HOTEL_ID . ", 'BK-RACE-2', " . self::ROOM_STD_1 . ", " . self::GUEST_B . ", :cin, :cout, 'pending', 2200.00)"
        )->execute(['cin' => $today, 'cout' => $tomorrow]);
    }

    // =========================================================================
    // SECTION 4: ROOM STATUS AND HOUSEKEEPING TESTS
    // =========================================================================

    public function test35_FreeReadyRoomState(): void
    {
        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r901 = current(array_filter($roomsData['rooms'], fn($r) => $r['roomNo'] === 901));

        $this->assertSame('free', $r901['status']);
        $this->assertSame('ok', $r901['housekeepingStatus']);
        $this->assertTrue($r901['isReady']);
    }

    public function test36_FreeCleaningRoomState(): void
    {
        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r904 = current(array_filter($roomsData['rooms'], fn($r) => $r['roomNo'] === 904));

        $this->assertSame('cleaning', $r904['status']);
        $this->assertSame('cleaning', $r904['housekeepingStatus']);
        $this->assertFalse($r904['isReady']);
    }

    public function test37_FreeRepairRoomState(): void
    {
        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r905 = current(array_filter($roomsData['rooms'], fn($r) => $r['roomNo'] === 905));

        $this->assertSame('repair', $r905['status']);
        $this->assertSame('repair', $r905['housekeepingStatus']);
        $this->assertFalse($r905['isReady']);
    }

    public function test38_BookedReadyRoomState(): void
    {
        $today = date('Y-m-d');
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+2 days')), 2, 2200.00, 200.00, 'cash', 1
        );

        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r901 = current(array_filter($roomsData['rooms'], fn($r) => $r['roomNo'] === 901));

        $this->assertSame('booked', $r901['status']);
        $this->assertSame('ok', $r901['housekeepingStatus']);
        $this->assertTrue($r901['isReady']);
    }

    public function test39_BookedCleaningRoomCanBeBookedForFutureButCheckInBlocked(): void
    {
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+3 days'));

        // Room 904 is currently cleaning. Future booking must succeed!
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_CLN_1, '9876500001', 'Aarav Sharma',
            $tomorrow, $dayAfter, 2, 2200.00, 500.00, 'cash', 1
        );
        $this->assertSame('pending', $b['status']);

        // But attempting check-in while room is in 'cleaning' status must be blocked
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 904 is not ready (cleaning in progress).');

        $this->stays->checkInFromReservation((int) $b['id'], self::HOTEL_ID, 1);
    }

    public function test40_CheckInBlockedWhenRoomIsRepair(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 905 is under maintenance and cannot be booked.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_REP_1, '9876500001', 'Aarav Sharma',
            '2026-11-20', '2026-11-22', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test41_OccupiedRoomTakesPriorityOverBooked(): void
    {
        $today = date('Y-m-d');
        // Check in guest to Room 901
        $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Active InHouse',
            'Aadhaar', '123456789012', 'Pune', 2, 2, 2200.00, 1000.00, 'cash', 1
        );

        // Future booking for Room 901 on subsequent dates
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500002', 'Future Booker',
            date('Y-m-d', strtotime('+3 days')), date('Y-m-d', strtotime('+5 days')), 2, 2200.00, 0.00, 'cash', 1
        );

        $roomsData = $this->roomService->listRooms(self::HOTEL_ID);
        $r901 = current(array_filter($roomsData['rooms'], fn($r) => $r['roomNo'] === 901));

        $this->assertSame('occupied', $r901['status'], 'Active in-house stay must take precedence over future booking');
        $this->assertSame('Active InHouse', $r901['guestName']);
        $this->assertSame(date('Y-m-d', strtotime('+3 days')), $r901['nextBookingDate']);
    }

    public function test42_CheckoutAutomaticallySetsRoomToCleaningAndCreatesLog(): void
    {
        $stay = $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Leaving Guest',
            'Aadhaar', '123456789012', 'Delhi', 1, 2, 2200.00, 2310.00, 'cash', 1
        );

        $this->stays->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1);

        $room = $this->rooms->find(self::ROOM_STD_1);
        $this->assertSame('cleaning', $room['housekeeping_status']);

        // Housekeeping log recorded
        $logs = $this->db->query("SELECT * FROM housekeeping_logs WHERE room_id = " . self::ROOM_STD_1 . " ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $this->assertNotEmpty($logs);
        $this->assertSame('cleaning', $logs['action']);
    }

    public function test43_HousekeepingActionChangesStatusToReady(): void
    {
        // Room 904 is currently cleaning
        $this->roomService->setHousekeeping(self::ROOM_CLN_1, 'ready', null, 1, self::HOTEL_ID);

        $room = $this->rooms->find(self::ROOM_CLN_1);
        $this->assertSame('ok', $room['housekeeping_status']);

        $logs = $this->db->query("SELECT * FROM housekeeping_logs WHERE room_id = " . self::ROOM_CLN_1 . " ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        $this->assertNotEmpty($logs);
        $this->assertSame('ready', $logs['action']);
    }

    // =========================================================================
    // SECTION 5: ROOM CAPACITY TESTS
    // =========================================================================

    public function test44_CapacityValidation(): void
    {
        $today = date('Y-m-d');
        // Room 901 max_persons is 2
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room allows a maximum of 2 persons.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 3, 2200.00, 0.00, 'cash', 1
        );
    }

    // =========================================================================
    // SECTION 6: ADVANCE AND PAYMENT TESTS
    // =========================================================================

    public function test45_AdvancePaymentRecordingAndBalanceCalculation(): void
    {
        $today = date('Y-m-d');
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+2 days')), 2, 2200.00, 1000.00, 'card', 1
        );

        $this->assertEquals(1000.00, (float) $b['advance_amount']);
        $this->assertSame('card', $b['advance_method']);

        // Add additional advance payment
        $updated = $this->reservations->recordAdvancePayment((int) $b['id'], self::HOTEL_ID, 500.00, 'upi', 1);
        $this->assertEquals(1500.00, (float) $updated['advance_amount']);
        $this->assertEquals(1500.00, (float) $updated['advance_paid']);

        // Check payments in database
        $payments = $this->payments->forReservation((int) $b['id']);
        $this->assertCount(2, $payments);
        $this->assertEquals(1000.00, (float) $payments[0]['amount']);
        $this->assertEquals(500.00, (float) $payments[1]['amount']);
    }

    // =========================================================================
    // SECTION 7: BOOKING FORM VALIDATION
    // =========================================================================

    public function test46_EmptyGuestNameRejected(): void
    {
        $today = date('Y-m-d');
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Guest name cannot be empty.');

        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', '   ',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
    }

    public function test47_InvalidRoomIdRejected(): void
    {
        $today = date('Y-m-d');
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room not found.');

        $this->reservations->create(
            self::HOTEL_ID, 999999, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );
    }

    // =========================================================================
    // SECTION 8: EDIT AND MODIFY BOOKING TESTS
    // =========================================================================

    public function test48_ModifyBookingDatesRoomAndTariff(): void
    {
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-20', '2026-11-22', 2, 2200.00, 500.00, 'cash', 1
        );

        $updated = $this->reservations->update(
            (int) $b['id'], self::HOTEL_ID, self::ROOM_STD_2,
            '2026-11-21', '2026-11-24', 2, 2500.00, 800.00, 'card', 1, null, 'Aarav Updated'
        );

        $this->assertSame(self::ROOM_STD_2, (int) $updated['room_id']);
        $this->assertSame('2026-11-21', $updated['check_in_date']);
        $this->assertSame('2026-11-24', $updated['check_out_date']);
        $this->assertEquals(2500.00, (float) $updated['rate']);
        $this->assertEquals(800.00, (float) $updated['advance_amount']);
        $this->assertSame('card', $updated['advance_method']);
        $this->assertSame('Aarav Updated', $updated['guest_name']);
    }

    public function test49_ModifyBookingToConflictingDatesBlocked(): void
    {
        // Booking 1 on Room 901
        $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Guest 1',
            '2026-11-20', '2026-11-25', 2, 2200.00, 0.00, 'cash', 1
        );

        // Booking 2 on Room 902
        $b2 = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_2, '9876500002', 'Guest 2',
            '2026-11-28', '2026-11-30', 2, 2200.00, 0.00, 'cash', 1
        );

        // Reassign Booking 2 to Room 901 overlapping with Booking 1
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservations->update(
            (int) $b2['id'], self::HOTEL_ID, self::ROOM_STD_1,
            '2026-11-22', '2026-11-26', 2, 2200.00, 0.00, 'cash', 1
        );
    }

    // =========================================================================
    // SECTION 9: CANCELLATION AND REFUND TESTS
    // =========================================================================

    public function test50_CancellationWithRefundComputation(): void
    {
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            '2026-11-25', '2026-11-27', 2, 2200.00, 1000.00, 'upi', 1
        );

        // Free cancellation before deadline
        $preview = $this->reservations->cancellationPreview((int) $b['id'], self::HOTEL_ID);
        $this->assertEquals(1000.00, $preview['eligiblePaid']);
        $this->assertEquals(0.00, $preview['cancellationFee']);
        $this->assertEquals(1000.00, $preview['refundableAmount']);

        // Execute cancel with immediate refund
        $cancelled = $this->reservations->cancel(
            (int) $b['id'], self::HOTEL_ID, 'Flight cancelled', 1000.00, 'upi', 1, null, true
        );

        $this->assertSame('cancelled', $cancelled['status']);
        $this->assertEquals(1000.00, (float) $cancelled['refundable_amount']);

        // Check payments recorded
        $payments = $this->payments->forReservation((int) $b['id']);
        $this->assertCount(2, $payments);
        $this->assertSame('refund', $payments[1]['type']);
        $this->assertEquals(1000.00, (float) $payments[1]['amount']);
        $this->assertSame('successful', $payments[1]['status']);
    }

    // =========================================================================
    // SECTION 10: CHECK-IN VALIDATION
    // =========================================================================

    public function test51_CheckInFromReservationMandatoryAdvanceValidation(): void
    {
        $today = date('Y-m-d');
        // Booking with 0 advance
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 0.00, 'cash', 1
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stays->checkInFromReservation((int) $b['id'], self::HOTEL_ID, 1);
    }

    public function test52_CheckInFromReservationSuccessWithAdvance(): void
    {
        $today = date('Y-m-d');
        $b = $this->reservations->create(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Aarav Sharma',
            $today, date('Y-m-d', strtotime('+1 day')), 2, 2200.00, 500.00, 'cash', 1
        );

        $stay = $this->stays->checkInFromReservation((int) $b['id'], self::HOTEL_ID, 1);
        $this->assertSame('in_house', $stay['status']);
        $this->assertSame(self::ROOM_STD_1, (int) $stay['room_id']);

        // Reservation status updated to checked_in
        $updatedRes = $this->reservations->find((int) $b['id'], self::HOTEL_ID);
        $this->assertSame('checked_in', $updatedRes['status']);
    }

    // =========================================================================
    // SECTION 11: CHECKOUT VALIDATION
    // =========================================================================

    public function test53_CheckoutWithFullSettlementIssuesGstInvoice(): void
    {
        $stay = $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Full Checkout Guest',
            'Aadhaar', '123456789012', 'Delhi', 1, 2, 2200.00, 1000.00, 'cash', 1
        );

        // Bill: 1 night @ 2200 + 5% GST = 2310. Advance = 1000. Outstanding = 1310.
        $checkout = $this->stays->checkout((int) $stay['id'], self::HOTEL_ID, 'card', null, 1, 1310.00);

        $this->assertSame('checked_out', $checkout['stay']['status']);
        $this->assertNotEmpty($checkout['invoice']['invoice_number']);

        // Invoice row in database
        $invoice = $this->db->query("SELECT * FROM invoices WHERE stay_id = " . (int) $stay['id'])->fetch(PDO::FETCH_ASSOC);
        $this->assertNotEmpty($invoice);
        $this->assertEquals(2310.00, (float) $invoice['total_amount']);
        $this->assertEquals(1000.00, (float) $invoice['advance_paid']);
        $this->assertEquals(0.00, (float) $invoice['balance_amount'], 'Balance should be zero after full settlement at checkout');
    }

    public function test54_CheckoutWithPartialPaymentRejected(): void
    {
        $stay = $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'Partial Payer',
            'Aadhaar', '123456789012', 'Delhi', 1, 2, 2200.00, 1000.00, 'cash', 1
        );

        // Outstanding is 1310. Attempting to pay only 500 must fail.
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Partial payment is not allowed.');

        $this->stays->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1, 500.00);
    }

    public function test55_DuplicateCheckoutPrevented(): void
    {
        $stay = $this->stays->directCheckIn(
            self::HOTEL_ID, self::ROOM_STD_1, '9876500001', 'One Checkout Guest',
            'Aadhaar', '123456789012', 'Delhi', 1, 2, 2200.00, 2310.00, 'cash', 1
        );
        $this->stays->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This stay is already checked out.');

        $this->stays->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1);
    }
}
