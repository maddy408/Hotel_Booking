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
use App\Support\IdImageUploader;
use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;

final class BookingAvailabilityAndWorkflowTest extends TestCase
{
    private const HOTEL_ID = 997;
    private PDO $db;
    private ReservationRepository $reservationRepo;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private PaymentRepository $paymentRepo;
    private SettingsRepository $settingsRepo;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private AvailabilityService $availability;
    private ReservationService $reservationService;
    private StayService $stayService;
    private RoomService $roomService;

    private int $room209Id;
    private int $room108Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Setup test hotel 997
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test Hotel 997', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'BAWTest', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9971, " . self::HOTEL_ID . ", 'FAM', 'Family', 4800.00, 4)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9972, " . self::HOTEL_ID . ", 'STD', 'Standard', 2200.00, 2)");

        // Room 209 (ID 99709) and Room 108 (ID 99708)
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99709, " . self::HOTEL_ID . ", 209, 2, 9971, 'ok')");
        $this->room209Id = 99709;
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99708, " . self::HOTEL_ID . ", 108, 1, 9972, 'ok')");
        $this->room108Id = 99708;

        // Test Guest
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone) VALUES (99799, " . self::HOTEL_ID . ", 'Sangeetha Vel', '9790145528')");
        $this->guestId = 99799;

        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'));
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $billing = new BillingService(new GstService($this->settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $this->roomRepo, $this->guestService,
            $this->availability, $this->paymentRepo, $this->settingsRepo, $audit, $this->stayRepo
        );

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $this->roomRepo,
            new StayChargeRepository($this->db), $this->paymentRepo,
            new HousekeepingLogRepository($this->db), $this->settingsRepo,
            $this->guestService, $this->availability, $billing, $invoiceService, $audit
        );

        $this->roomService = new RoomService(
            $this->roomRepo, new RoomTypeRepository($this->db),
            new HousekeepingLogRepository($this->db), $audit
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
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (99709, 99708)");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    public function testActualHotel1Bk1002RecordAndIntegrity(): void
    {
        $stmt = $this->db->prepare("SELECT * FROM reservations WHERE hotel_id = 1 AND status = 'pending' ORDER BY id LIMIT 1");
        $stmt->execute();
        $bk = $stmt->fetch(PDO::FETCH_ASSOC);

        $this->assertNotEmpty($bk);
        $this->assertSame('pending', $bk['status']);

        // Check associated stay is null
        $stmt = $this->db->prepare('SELECT * FROM stays WHERE reservation_id = :id');
        $stmt->execute(['id' => $bk['id']]);
        $this->assertEmpty($stmt->fetchAll());
    }

    public function testOverlappingActiveReservationCreationIsBlockedOnServiceLevel(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // 1. Create BK-1002 on Room 209 (today to tomorrow)
        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9790145528',
            'Sangeetha Vel',
            $today,
            $tomorrow,
            4,
            4800.00,
            0.00,
            'cash',
            1
        );

        // 2. Try creating an overlapping active reservation on Room 209 (today to tomorrow)
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9876543210',
            'Overlapping Guest',
            $today,
            $tomorrow,
            2,
            4800.00,
            0.00,
            'cash',
            1
        );
    }

    public function testOverlappingActiveReservationCreationIsBlockedOnDatabaseLevel(): void
    {
        // Create initial reservation
        $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (:hid, :code, :rid, :gid, :in, :out, :status, :rate)'
        )->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-ORIGINAL',
            'rid' => $this->room209Id,
            'gid' => $this->guestId,
            'in' => '2026-11-06',
            'out' => '2026-11-07',
            'status' => 'pending',
            'rate' => 4800.00,
        ]);

        // Trigger trg_reservations_prevent_overlap_insert must reject direct INSERT
        $this->expectException(PDOException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $stmt = $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (:hid, :code, :rid, :gid, :in, :out, :status, :rate)'
        );
        $stmt->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-DIRECT-FAIL',
            'rid' => $this->room209Id,
            'gid' => $this->guestId,
            'in' => '2026-11-06',
            'out' => '2026-11-07',
            'status' => 'pending',
            'rate' => 4800.00,
        ]);
    }

    public function testConsecutiveBookingIsAllowed(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        // 1. Create BK-1002 on Room 209 (today to tomorrow)
        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9790145528',
            'Sangeetha Vel',
            $today,
            $tomorrow,
            4,
            4800.00,
            0.00,
            'cash',
            1
        );

        // 2. Consecutive booking: Guest A leaves on tomorrow. Guest B arrives on tomorrow.
        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9876543210',
            'Consecutive Guest',
            $tomorrow,
            $dayAfter,
            2,
            4800.00,
            0.00,
            'cash',
            1
        );

        $this->assertNotEmpty($res);
        $this->assertSame($this->room209Id, (int) $res['room_id']);
        $this->assertSame($tomorrow, $res['check_in_date']);
        $this->assertSame($dayAfter, $res['check_out_date']);
    }

    public function testValidationAppliesToBookingEditsAndRoomReassignment(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        // Create BK-1002 on Room 209 for today -> tomorrow
        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9790145528',
            'Sangeetha Vel',
            $today,
            $tomorrow,
            4,
            4800.00,
            0.00,
            'cash',
            1
        );

        // Create booking on Room 108 for 2026-11-15 -> 2026-11-17
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room108Id,
            '9876543210',
            'Transfer Guest',
            '2026-11-15',
            '2026-11-17',
            2,
            2200.00,
            0.00,
            'cash',
            1
        );

        // Attempt to reassign room to Room 209 for dates overlapping BK-1002
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->reservationService->update(
            (int) $booking['id'],
            self::HOTEL_ID,
            $this->room209Id,
            $today,
            $dayAfter,
            2,
            4800.00,
            0.00,
            'cash',
            1
        );
    }

    public function testDatabaseTriggerBlocksOverlappingUpdate(): void
    {
        // Create two non-overlapping bookings on Room 209
        $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (:hid, :code, :rid, :gid, :in, :out, :status, :rate)'
        )->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-TEST-1',
            'rid' => $this->room209Id,
            'gid' => $this->guestId,
            'in' => '2026-11-06',
            'out' => '2026-11-07',
            'status' => 'pending',
            'rate' => 4800.00,
        ]);

        $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (:hid, :code, :rid, :gid, :in, :out, :status, :rate)'
        )->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-TEST-2',
            'rid' => $this->room209Id,
            'gid' => $this->guestId,
            'in' => '2026-12-01',
            'out' => '2026-12-03',
            'status' => 'pending',
            'rate' => 4800.00,
        ]);
        $resId2 = (int) $this->db->lastInsertId();

        // Updating BK-TEST-2 directly via SQL to overlap BK-TEST-1 must trigger SQLSTATE 45000
        $this->expectException(PDOException::class);
        $this->expectExceptionMessage('This room is already booked for part of those dates.');

        $this->db->prepare(
            'UPDATE reservations SET check_in_date = :in, check_out_date = :out WHERE id = :id'
        )->execute([
            'in' => '2026-11-06',
            'out' => '2026-11-07',
            'id' => $resId2,
        ]);
    }

    public function testCancelledBookingDoesNotBlockAvailability(): void
    {
        // Create a booking in the future
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room209Id,
            '9876543210',
            'Future Guest',
            '2026-12-20',
            '2026-12-22',
            2,
            4800.00,
            0.00,
            'cash',
            1
        );

        $this->assertFalse($this->availability->isFree($this->room209Id, '2026-12-20', '2026-12-22'));

        // Cancel the booking
        $this->reservationService->cancel((int) $booking['id'], self::HOTEL_ID, 'Guest cancelled', 0.00, 'cash', 1);

        // Room must now be free
        $this->assertTrue($this->availability->isFree($this->room209Id, '2026-12-20', '2026-12-22'));
    }

    public function testNoShowBookingDoesNotBlockAvailability(): void
    {
        // Insert a booking in the past
        $this->db->prepare(
            'INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate)
             VALUES (:hid, :code, :rid, :gid, :in, :out, :status, :rate)'
        )->execute([
            'hid' => self::HOTEL_ID,
            'code' => 'BK-PAST-1',
            'rid' => $this->room209Id,
            'gid' => $this->guestId,
            'in' => '2026-11-04',
            'out' => '2026-11-05',
            'status' => 'pending',
            'rate' => 4800.00,
        ]);
        $pastId = (int) $this->db->lastInsertId();

        $this->assertFalse($this->availability->isFree($this->room209Id, '2026-11-04', '2026-11-05'));

        // Mark as no-show
        $this->reservationService->markNoShow($pastId, self::HOTEL_ID, 1);

        // Room must now be free on those past dates
        $this->assertTrue($this->availability->isFree($this->room209Id, '2026-11-04', '2026-11-05'));
    }

    public function testActiveInHouseStayBlocksOverlappingBooking(): void
    {
        // Direct check-in to Room 108: 2026-11-07 to 2026-11-09 (2 days)
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room108Id,
            '9876543210',
            'InHouse Guest',
            'Aadhaar',
            '123456789012',
            'Chennai',
            2,
            2,
            2200.00,
            500.00,
            'cash',
            1
        );
        $this->assertNotNull($stay);

        // Creating booking overlapping stay is rejected
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('occupied');

        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room108Id,
            '9876543210',
            'Stay Overlap Guest',
            date('Y-m-d'),
            date('Y-m-d', strtotime('+1 day')),
            1,
            2200.00,
            0.00,
            'cash',
            1
        );
    }

    public function testCompleteWorkflowCreateEditCancelAndCheckIn(): void
    {
        // 1. Create a booking for Room 108
        $b1 = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room108Id,
            '9876543210',
            'Workflow Guest',
            '2026-12-10',
            '2026-12-12',
            2,
            2200.00,
            500.00,
            'cash',
            1
        );
        $this->assertNotNull($b1);
        $this->assertSame('pending', $b1['status']);

        // 2. Edit the booking (change dates)
        $b1Updated = $this->reservationService->update(
            (int) $b1['id'],
            self::HOTEL_ID,
            $this->room108Id,
            '2026-12-11',
            '2026-12-13',
            2,
            2200.00,
            500.00,
            'cash',
            1
        );
        $this->assertSame('2026-12-11', $b1Updated['check_in_date']);
        $this->assertSame('2026-12-13', $b1Updated['check_out_date']);

        // 3. Cancel the booking
        $b1Cancelled = $this->reservationService->cancel((int) $b1['id'], self::HOTEL_ID, 'Changed plans', 500.00, 'cash', 1);
        $this->assertSame('cancelled', $b1Cancelled['status']);
        $this->assertTrue($this->availability->isFree($this->room108Id, '2026-12-11', '2026-12-13'));

        // 4. Create a fresh booking for today and check in
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $b2 = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room108Id,
            '9876543210',
            'Arrival Guest',
            $today,
            $tomorrow,
            2,
            2200.00,
            500.00,
            'cash',
            1
        );

        $stay = $this->stayService->checkInFromReservation((int) $b2['id'], self::HOTEL_ID, 1);
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
        $this->assertSame($this->room108Id, (int) $stay['room_id']);

        // Room 108 is now occupied
        $this->assertFalse($this->availability->isFree($this->room108Id, $today, $tomorrow));
    }
}
