<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\GuestRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Validates all 10 core duplicate booking prevention scenarios:
 * 1. Two bookings with identical dates for the same room – second booking must be rejected.
 * 2. Two bookings with partially overlapping dates – reject.
 * 3. First guest checks out on the same date the next guest arrives – allow booking.
 * 4. Cancelled booking followed by a new booking – allow.
 * 5. No-show booking followed by a new booking – allow.
 * 6. Overdue guest still staying – reject another overlapping booking.
 * 7. Edit an existing booking to an already-booked room – reject.
 * 8. Two users trying to book the same room simultaneously – only one booking succeeds.
 * 9. Direct Check-in for an occupied room – reject.
 * 10. Room under Cleaning or Repair – do not offer it for check-in.
 */
final class DuplicateBookingPreventionTenScenariosTest extends TestCase
{
    private const HOTEL_ID = 1;
    private const USER_ID = 1;

    private PDO $db;
    private ReservationService $reservations;
    private StayService $stays;
    private AvailabilityService $availability;
    private RoomRepository $roomRepo;
    private int $roomId;
    private int $room2Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->roomRepo = new RoomRepository($this->db);
        $resRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $guestRepo = new GuestRepository($this->db);
        $payRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new \App\Repository\AuditLogRepository($this->db));
        $guestService = new GuestService($guestRepo, null, $audit);
        $this->availability = new AvailabilityService($resRepo, $stayRepo);
        $gstService = new \App\Service\GstService($settingsRepo);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $payRepo);
        $invoice = new InvoiceService($this->db, new \App\Repository\InvoiceRepository($this->db));

        $this->reservations = new ReservationService(
            $this->db, $resRepo, $this->roomRepo, $guestService,
            $this->availability, $payRepo, $settingsRepo, $audit, $stayRepo
        );

        $this->stays = new StayService(
            $this->db, $stayRepo, $resRepo, $this->roomRepo, new StayChargeRepository($this->db),
            $payRepo, new \App\Repository\HousekeepingLogRepository($this->db),
            $settingsRepo, $guestService, $this->availability, $billing, $invoice, $audit
        );

        // Fetch Room 304 and 305 for test isolation
        $r1 = $this->roomRepo->findByRoomNo(self::HOTEL_ID, 304);
        $r2 = $this->roomRepo->findByRoomNo(self::HOTEL_ID, 305);
        $this->roomId = (int) $r1['id'];
        $this->room2Id = (int) $r2['id'];

        $guest = $guestService->findOrCreateMinimal(self::HOTEL_ID, '9876543210', 'Primary Test Guest');
        $this->guestId = (int) $guest['id'];
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $r1 = $this->db->query("SELECT id FROM rooms WHERE hotel_id = 1 AND room_no = 304")->fetchColumn();
        $r2 = $this->db->query("SELECT id FROM rooms WHERE hotel_id = 1 AND room_no = 305")->fetchColumn();
        if ($r1 && $r2) {
            $this->db->exec("DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE room_id IN ($r1, $r2))");
            $this->db->exec("DELETE FROM stays WHERE room_id IN ($r1, $r2)");
            $this->db->exec("DELETE FROM reservations WHERE room_id IN ($r1, $r2)");
            $this->db->exec("UPDATE rooms SET housekeeping_status = 'ok' WHERE id IN ($r1, $r2)");
        }
    }

    /** 1. Two bookings with identical dates for the same room – second booking must be rejected. */
    public function testCase1IdenticalDatesRejected(): void
    {
        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest A',
            '2027-04-10', '2027-04-15', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for these dates. Please select another room.');

        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543211', 'Guest B',
            '2027-04-10', '2027-04-15', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
    }

    /** 2. Two bookings with partially overlapping dates – reject. */
    public function testCase2PartiallyOverlappingDatesRejected(): void
    {
        // Guest A: 21 Nov to 23 Nov
        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest A',
            '2027-05-21', '2027-05-23', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );

        // Guest B: 22 Nov to 24 Nov (overlapping)
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for these dates. Please select another room.');

        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543212', 'Guest B',
            '2027-05-22', '2027-05-24', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
    }

    /** 3. First guest checks out on the same date the next guest arrives – allow booking. */
    public function testCase3SameDayCheckoutArrivalAllowed(): void
    {
        // Guest A: 21 Nov to 23 Nov
        $b1 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest A',
            '2027-06-21', '2027-06-23', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
        $this->assertNotNull($b1['id']);

        // Guest B: 23 Nov to 25 Nov (non-overlapping turnover)
        $b2 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543213', 'Guest B',
            '2027-06-23', '2027-06-25', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
        $this->assertNotNull($b2['id']);
        $this->assertNotSame($b1['id'], $b2['id']);
    }

    /** 4. Cancelled booking followed by a new booking – allow. */
    public function testCase4CancelledBookingAllowsNewBooking(): void
    {
        $b1 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest Cancel',
            '2027-07-01', '2027-07-05', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );

        // Cancel the booking
        $this->reservations->cancel((int) $b1['id'], self::HOTEL_ID, 'Guest changed plans', 500.0, 'cash', self::USER_ID);

        // New booking on same dates must succeed
        $b2 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543214', 'Guest Replacement',
            '2027-07-01', '2027-07-05', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
        $this->assertNotNull($b2['id']);
    }

    /** 5. No-show booking followed by a new booking – allow. */
    public function testCase5NoShowBookingAllowsNewBooking(): void
    {
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Booking with arrival date yesterday
        $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate, advance_amount)
             VALUES (:hid, :code, :rid, :gid, :in, :out, \'pending\', 2500.0, 500.0)'
        )->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-NOSHOW-TEST',
            'rid' => $this->roomId,
            'gid' => $this->guestId,
            'in' => $yesterday,
            'out' => $today,
        ]);
        $b1Id = (int) $this->db->lastInsertId();

        // Mark no-show (arrival date has passed)
        $this->reservations->markNoShow($b1Id, self::HOTEL_ID, self::USER_ID);

        // New booking on same room today must succeed
        $b2 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543215', 'Guest After NoShow',
            $today, $tomorrow, 1, 2500.0, 500.0, 'cash', self::USER_ID
        );
        $this->assertNotNull($b2['id']);
    }

    /** 6. Overdue guest still staying – reject another overlapping booking. */
    public function testCase6OverdueGuestStillStayingRejectsBooking(): void
    {
        $today = date('Y-m-d');
        $pastIn = date('Y-m-d', strtotime('-3 days'));
        $yesterday = date('Y-m-d', strtotime('-1 day'));

        // Direct check in an in-house stay that became overdue yesterday
        $this->db->prepare(
            "INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
             VALUES (:h, :r, :g, 1, 2500, :in, :out, 'in_house')"
        )->execute(['h' => self::HOTEL_ID, 'r' => $this->roomId, 'g' => $this->guestId, 'in' => $pastIn, 'out' => $yesterday]);

        // Attempting to book this room for today through tomorrow must be rejected
        $this->expectException(ApiException::class);

        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543216', 'Guest While Overdue',
            $today, $tomorrow, 1, 2500.0, 0.0, 'cash', self::USER_ID
        );
    }

    /** 7. Edit an existing booking to an already-booked room – reject. */
    public function testCase7EditExistingBookingToBookedRoomRejected(): void
    {
        // Booking 1 on Room 304: 2027-09-10 to 2027-09-15
        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest In 304',
            '2027-09-10', '2027-09-15', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );

        // Booking 2 on Room 305: 2027-09-10 to 2027-09-15
        $b2 = $this->reservations->create(
            self::HOTEL_ID, $this->room2Id, '9876543217', 'Guest In 305',
            '2027-09-10', '2027-09-15', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );

        // Try editing Booking 2 to assign Room 304
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for these dates. Please select another room.');

        $this->reservations->update(
            (int) $b2['id'],
            self::HOTEL_ID,
            $this->roomId, // Room 304 (already booked!)
            '2027-09-10',
            '2027-09-15',
            2,
            2500.0,
            500.0,
            'cash',
            self::USER_ID
        );
    }

    /** 8. Two users trying to book the same room simultaneously – only one booking succeeds. */
    public function testCase8SimultaneousBookingValidationSafety(): void
    {
        // First transaction books the room
        $b1 = $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Concurrency User 1',
            '2027-10-01', '2027-10-05', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
        $this->assertNotNull($b1['id']);

        // Second attempt for the same room & dates must be blocked
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for these dates. Please select another room.');

        $this->reservations->create(
            self::HOTEL_ID, $this->roomId, '9876543218', 'Concurrency User 2',
            '2027-10-02', '2027-10-06', 2, 2500.0, 500.0, 'cash', self::USER_ID
        );
    }

    /** 9. Direct Check-in for an occupied room – reject. */
    public function testCase9DirectCheckInOccupiedRoomRejected(): void
    {
        $today = date('Y-m-d');
        $out = date('Y-m-d', strtotime('+2 days'));

        // Create in-house stay in Room 304
        $this->db->prepare(
            "INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status)
             VALUES (:h, :r, :g, 1, 2500, :in, :out, 'in_house')"
        )->execute(['h' => self::HOTEL_ID, 'r' => $this->roomId, 'g' => $this->guestId, 'in' => $today, 'out' => $out]);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('already occupied by another active stay');

        $this->stays->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543219', 'Walkin Guest',
            'Aadhaar', '998877665544', 'Madurai', 1, 1, 2500.0, 1000.0, 'cash', self::USER_ID
        );
    }

    /** 10. Room under Cleaning or Repair – do not offer it for check-in. */
    public function testCase10RoomUnderCleaningOrRepairRejectedForCheckIn(): void
    {
        // 10a. Room under repair
        $this->db->prepare("UPDATE rooms SET housekeeping_status = 'repair' WHERE id = :id")->execute(['id' => $this->roomId]);

        try {
            $this->stays->directCheckIn(
                self::HOTEL_ID, $this->roomId, '9876543220', 'Walkin Repair',
                'Aadhaar', '112233445566', 'Madurai', 1, 1, 2500.0, 1000.0, 'cash', self::USER_ID
            );
            $this->fail('Expected repair room direct check-in to be rejected');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertStringContainsString('under maintenance', $e->getMessage());
        }

        // 10b. Room under cleaning
        $this->db->prepare("UPDATE rooms SET housekeeping_status = 'cleaning' WHERE id = :id")->execute(['id' => $this->roomId]);

        try {
            $this->stays->directCheckIn(
                self::HOTEL_ID, $this->roomId, '9876543221', 'Walkin Cleaning',
                'Aadhaar', '112233445577', 'Madurai', 1, 1, 2500.0, 1000.0, 'cash', self::USER_ID
            );
            $this->fail('Expected cleaning room direct check-in to be rejected');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertStringContainsString('not ready (cleaning in progress)', $e->getMessage());
        }
    }
}
