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

final class CompleteEditFunctionalityTest extends TestCase
{
    private PDO $db;
    private GuestService $guestService;
    private GuestRepository $guestRepo;
    private RoomService $roomService;
    private RoomRepository $roomRepo;
    private RoomTypeRepository $roomTypeRepo;
    private ReservationService $reservationService;
    private ReservationRepository $reservationRepo;
    private StayService $stayService;
    private StayRepository $stayRepo;
    private InvoiceRepository $invoiceRepo;
    private AuditLogRepository $auditRepo;
    private const HOTEL_ID = 994;
    private const USER_ID = 1;

    private int $room1Id;
    private int $room2Id;
    private int $typeStandardId;
    private int $typeDeluxeId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $hId = self::HOTEL_ID;
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES ({$hId}, 'Test Hotel 994', 'Chennai')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES ({$hId}, 'INV', 12, 'Asia/Kolkata')");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9941, {$hId}, 'STD', 'Standard Room', 2000.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9942, {$hId}, 'DLX', 'Deluxe Room', 3500.00, 3)");
        $this->typeStandardId = 9941;
        $this->typeDeluxeId = 9942;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99401, {$hId}, 101, 1, 9941, 'ok')");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99402, {$hId}, 102, 1, 9942, 'ok')");
        $this->room1Id = 99401;
        $this->room2Id = 99402;

        $this->auditRepo = new AuditLogRepository($this->db);
        $auditLogger = new AuditLogger($this->auditRepo);

        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo, null, $auditLogger);

        $this->roomRepo = new RoomRepository($this->db);
        $this->roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $this->roomService = new RoomService($this->roomRepo, $this->roomTypeRepo, $hkRepo, $auditLogger);

        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $stayChargeRepo = new StayChargeRepository($this->db);

        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $gstService = new GstService($settingsRepo);
        $billingService = new BillingService($gstService, $stayChargeRepo, $paymentRepo, $settingsRepo);
        $this->invoiceRepo = new InvoiceRepository($this->db);
        $invoiceService = new InvoiceService($this->db, $this->invoiceRepo);

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $this->roomRepo,
            $this->guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $auditLogger,
            $this->stayRepo
        );

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            $stayChargeRepo,
            $paymentRepo,
            $hkRepo,
            $settingsRepo,
            $this->guestService,
            $availability,
            $billingService,
            $invoiceService,
            $auditLogger
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $hId = self::HOTEL_ID;
        $this->db->exec("DELETE FROM stays WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM payments WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM guests WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM settings WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM audit_logs WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM hotels WHERE id = {$hId}");
    }

    // ==========================================
    // 1. GUESTS MODULE TESTS
    // ==========================================

    public function testGuestUpdateSucceedsWithAllFields(): void
    {
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9876543210', 'Original Name', 'Chennai');
        $guestId = (int) $guest['id'];

        $updated = $this->guestService->update(self::HOTEL_ID, $guestId, [
            'name' => 'Updated Name',
            'phone' => '9876543211',
            'email' => 'updated.guest@example.com',
            'city' => 'Bengaluru',
            'address' => '123 MG Road, Bengaluru',
            'idProofType' => 'Passport',
            'idProofNumber' => 'P12345678',
        ], self::USER_ID);

        $this->assertSame('Updated Name', $updated['name']);
        $this->assertSame('9876543211', $updated['phone']);
        $this->assertSame('updated.guest@example.com', $updated['email']);
        $this->assertSame('Bengaluru', $updated['city']);
        $this->assertSame('123 MG Road, Bengaluru', $updated['address']);
        $this->assertSame('Passport', $updated['id_proof_type']);
        $this->assertSame('5678', $updated['id_proof_last4']);

        $public = $this->guestService->toPublic($updated);
        $this->assertSame('Updated Name', $public['name']);
        $this->assertSame('9876543211', $public['phone']);
        $this->assertSame('updated.guest@example.com', $public['email']);
        $this->assertSame('123 MG Road, Bengaluru', $public['address']);
        $this->assertStringContainsString('5678', $public['idProofMasked']);
    }

    public function testGuestUpdatePreventsDuplicatePhoneInSameHotel(): void
    {
        $guest1 = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9111111111', 'Guest One');
        $guest2 = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9222222222', 'Guest Two');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Another guest already exists with this phone number.');

        $this->guestService->update(self::HOTEL_ID, (int) $guest2['id'], [
            'phone' => '9111111111',
        ], self::USER_ID);
    }

    public function testGuestUpdateAllowsSamePhoneForSameGuest(): void
    {
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9333333333', 'Guest Three');
        $updated = $this->guestService->update(self::HOTEL_ID, (int) $guest['id'], [
            'name' => 'Guest Three Renamed',
            'phone' => '9333333333',
        ], self::USER_ID);

        $this->assertSame('Guest Three Renamed', $updated['name']);
        $this->assertSame('9333333333', $updated['phone']);
    }

    public function testGuestUpdateValidatesEmail(): void
    {
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9444444444', 'Guest Four');

        try {
            $this->guestService->update(self::HOTEL_ID, (int) $guest['id'], [
                'email' => 'invalid-email-string',
            ], self::USER_ID);
            $this->fail('Expected ApiException for invalid email.');
        } catch (ApiException $e) {
            $this->assertSame('Enter a valid email address.', $e->getFields()['email'] ?? null);
        }
    }

    public function testGuestUpdateCreatesAuditLog(): void
    {
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, '9555555555', 'Audit Test Guest');
        $guestId = (int) $guest['id'];

        $this->guestService->update(self::HOTEL_ID, $guestId, [
            'name' => 'Audited Guest Name',
            'city' => 'Hyderabad',
        ], self::USER_ID);

        $logs = $this->db->query("SELECT * FROM audit_logs WHERE hotel_id = " . self::HOTEL_ID . " AND entity_type = 'guest' AND entity_id = {$guestId} ORDER BY id DESC LIMIT 1")->fetch();
        $this->assertNotEmpty($logs);
        $this->assertSame('guest_update', $logs['action']);
        $after = json_decode($logs['after_json'], true);
        $this->assertSame('Audited Guest Name', $after['name']);
    }

    // ==========================================
    // 2. BOOKINGS MODULE TESTS
    // ==========================================

    public function testPendingReservationUpdateSucceedsWithNotesAndDates(): void
    {
        $checkIn = date('Y-m-d', strtotime('+10 days'));
        $checkOut = date('Y-m-d', strtotime('+13 days'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9888877777',
            'Booking Guest',
            $checkIn,
            $checkOut,
            1,
            2000.0,
            500.0,
            'cash',
            self::USER_ID,
            '12:00:00',
            'Original notes'
        );
        $bookingId = (int) $booking['id'];

        $newCheckIn = date('Y-m-d', strtotime('+12 days'));
        $newCheckOut = date('Y-m-d', strtotime('+16 days'));

        $updated = $this->reservationService->update(
            $bookingId,
            self::HOTEL_ID,
            $this->room2Id,
            $newCheckIn,
            $newCheckOut,
            2,
            2500.0,
            500.0,
            'cash',
            self::USER_ID,
            '11:00:00',
            'Updated Guest Name',
            '9888877777',
            'Updated notes: Ground floor requested'
        );

        $this->assertSame($this->room2Id, (int) $updated['room_id']);
        $this->assertSame($newCheckIn, $updated['check_in_date']);
        $this->assertSame($newCheckOut, $updated['check_out_date']);
        $this->assertSame(2, (int) $updated['persons']);
        $this->assertSame('2500.00', $updated['rate']);
        $this->assertSame('Updated notes: Ground floor requested', $updated['notes']);
        $this->assertSame('Updated Guest Name', $updated['guest_name']);
    }

    public function testPendingReservationUpdateEnforcesMaxPersons(): void
    {
        $checkIn = date('Y-m-d', strtotime('+20 days'));
        $checkOut = date('Y-m-d', strtotime('+22 days'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id, // Standard room, max 2 persons
            '9999988888',
            'Capacity Guest',
            $checkIn,
            $checkOut,
            1,
            1500.0,
            0.0,
            'cash',
            self::USER_ID
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('allows a maximum of 2 persons');

        $this->reservationService->update(
            (int) $booking['id'],
            self::HOTEL_ID,
            $this->room1Id,
            $checkIn,
            $checkOut,
            5, // exceeds 2 persons!
            1500.0,
            0.0,
            'cash',
            self::USER_ID
        );
    }

    public function testPendingReservationUpdatePreventsRoomOverlap(): void
    {
        $checkIn1 = date('Y-m-d', strtotime('+30 days'));
        $checkOut1 = date('Y-m-d', strtotime('+35 days'));

        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9123456780',
            'Existing Booking Guest',
            $checkIn1,
            $checkOut1,
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );

        $checkIn2 = date('Y-m-d', strtotime('+40 days'));
        $checkOut2 = date('Y-m-d', strtotime('+45 days'));

        $booking2 = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9123456781',
            'Second Guest',
            $checkIn2,
            $checkOut2,
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );

        // Try to update booking2 so it overlaps booking1
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('already booked for part of those dates');

        $this->reservationService->update(
            (int) $booking2['id'],
            self::HOTEL_ID,
            $this->room1Id,
            date('Y-m-d', strtotime('+32 days')), // overlaps booking1!
            date('Y-m-d', strtotime('+38 days')),
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );
    }

    public function testCheckedInReservationCannotBeEditedAsOrdinaryBooking(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9666666666',
            'Checked In Res Guest',
            date('Y-m-d', strtotime('+50 days')),
            date('Y-m-d', strtotime('+52 days')),
            1,
            2000.0,
            500.0,
            'cash',
            self::USER_ID
        );
        $this->reservationRepo->markCheckedIn((int) $res['id']);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Only pending bookings can be edited');

        $this->reservationService->update(
            (int) $res['id'],
            self::HOTEL_ID,
            $this->room1Id,
            date('Y-m-d', strtotime('+50 days')),
            date('Y-m-d', strtotime('+53 days')),
            1,
            2000.0,
            500.0,
            'cash',
            self::USER_ID
        );
    }

    public function testCancelledReservationCannotBeEdited(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9555544444',
            'Cancelled Guest',
            date('Y-m-d', strtotime('+60 days')),
            date('Y-m-d', strtotime('+62 days')),
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );

        $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Guest cancelled', 0.0, 'cash', self::USER_ID);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Only pending bookings can be edited');

        $this->reservationService->update(
            (int) $res['id'],
            self::HOTEL_ID,
            $this->room1Id,
            date('Y-m-d', strtotime('+60 days')),
            date('Y-m-d', strtotime('+63 days')),
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );
    }

    // ==========================================
    // 3. ROOM MASTER MODULE TESTS
    // ==========================================

    public function testRoomUpdateSucceeds(): void
    {
        $updated = $this->roomService->updateRoom(
            $this->room1Id,
            199, // new room number
            3,   // 3rd floor
            $this->typeDeluxeId,
            'Quiet corner room with garden view',
            self::HOTEL_ID,
            self::USER_ID
        );

        $this->assertSame(199, (int) $updated['room_no']);
        $this->assertSame(3, (int) $updated['floor']);
        $this->assertSame($this->typeDeluxeId, (int) $updated['room_type_id']);
        $this->assertSame('Quiet corner room with garden view', $updated['note']);

        // Check audit log
        $logs = $this->db->query("SELECT * FROM audit_logs WHERE hotel_id = " . self::HOTEL_ID . " AND entity_type = 'room' AND entity_id = {$this->room1Id} ORDER BY id DESC LIMIT 1")->fetch();
        $this->assertNotEmpty($logs);
        $this->assertSame('room_update', $logs['action']);
    }

    public function testRoomUpdatePreventsDuplicateRoomNumber(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('already exists');

        $this->roomService->updateRoom(
            $this->room1Id,
            102, // duplicate with room 2!
            1,
            $this->typeStandardId,
            null,
            self::HOTEL_ID,
            self::USER_ID
        );
    }

    public function testRoomUpdatePreventsCapacityBreakageForActiveStays(): void
    {
        // Create a 1-person max room type
        $smallTypeId = $this->roomTypeRepo->create(self::HOTEL_ID, 'SGL-TEST', 'Single Test Room', 1000.0, 1);

        // Create an active reservation for room 1 with 2 persons
        $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9888812345',
            'Two Person Booking',
            date('Y-m-d', strtotime('+70 days')),
            date('Y-m-d', strtotime('+72 days')),
            2, // 2 persons!
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );

        // Attempting to change this room's type to a 1-person type must be blocked!
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('has 2 persons, but Single Test Room only allows 1 persons');

        $this->roomService->updateRoom(
            $this->room1Id,
            101,
            1,
            $smallTypeId,
            null,
            self::HOTEL_ID,
            self::USER_ID
        );
    }

    public function testRoomTypeRateChangeDoesNotAlterExistingBookingRates(): void
    {
        // Create a booking with original rate 2000
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9991112222',
            'Rate Test Guest',
            date('Y-m-d', strtotime('+80 days')),
            date('Y-m-d', strtotime('+82 days')),
            1,
            2000.0,
            0.0,
            'cash',
            self::USER_ID
        );

        // Now update room type overnight rate to 3500
        $this->roomService->updateRoomType($this->typeStandardId, 'Updated Standard Room', 3500.0, 2, self::USER_ID, self::HOTEL_ID);

        // The existing confirmed booking must retain its original rate of 2000.00!
        $fetched = $this->reservationRepo->findWithDetails((int) $booking['id']);
        $this->assertSame('2000.00', $fetched['rate']);
    }
}
