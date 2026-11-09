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

final class BusinessLogicFixesTest extends TestCase
{
    private const HOTEL_ID = 998;
    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private GuestService $guestService;
    private PaymentRepository $paymentRepo;
    private InvoiceRepository $invoiceRepo;
    private RoomRepository $roomRepo;
    private ReservationRepository $reservationRepo;
    private int $roomId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->db->exec("INSERT INTO hotels (id, name) VALUES (" . self::HOTEL_ID . ", 'Fixes Hotel')");
        $this->db->exec("INSERT INTO settings (hotel_id, checkout_hour) VALUES (" . self::HOTEL_ID . ", 12)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9981, " . self::HOTEL_ID . ", 'STD', 'Standard Double', 1500, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id) VALUES (99801, " . self::HOTEL_ID . ", 801, 8, 9981)");
        $this->roomId = 99801;

        $guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($guestRepo);
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($this->reservationRepo, $stayRepo);
        $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));
        $this->invoiceRepo = new InvoiceRepository($this->db);

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $this->roomRepo, $this->guestService,
            $availability, $this->paymentRepo, $settingsRepo, $audit
        );

        $this->stayService = new StayService(
            $this->db, $stayRepo, $this->reservationRepo, $this->roomRepo, new StayChargeRepository($this->db),
            $this->paymentRepo, new HousekeepingLogRepository($this->db), $settingsRepo,
            $this->guestService, $availability, $billing, $invoiceService, $audit
        );

        $this->roomService = new RoomService(
            $this->roomRepo, new RoomTypeRepository($this->db), new HousekeepingLogRepository($this->db), $audit
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    public function testDirectCheckInWithoutAdvanceIsPrevented(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->roomId,
            '9876543210',
            'Test Guest',
            'Aadhaar',
            '123456789012',
            'Chennai',
            1,
            1,
            1500.0,
            0.0, // No advance
            'cash',
            null
        );
    }

    public function testDirectCheckInWithAdvanceSucceeds(): void
    {
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->roomId,
            '9876543210',
            'Test Guest Advance',
            'Aadhaar',
            '123456789012',
            'Chennai',
            1,
            1,
            1500.0,
            500.0, // Valid advance
            'upi',
            null,
            '11:00:00'
        );

        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
        $this->assertSame('11:00:00', $stay['checkout_time']);

        $payments = $this->paymentRepo->forStay((int) $stay['id']);
        $this->assertCount(1, $payments);
        $this->assertSame('advance', $payments[0]['type']);
        $this->assertEquals(500.0, (float) $payments[0]['amount']);
        $this->assertSame('successful', $payments[0]['status']);
    }

    public function testCheckInFromReservationWithoutAdvanceIsPrevented(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Create booking without advance
        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543211',
            'No Advance Booker',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0, // zero advance
            'cash',
            null
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
    }

    public function testCheckInFromReservationWithRecordedAdvanceSucceeds(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543212',
            'Advance Booker',
            $today,
            $tomorrow,
            1,
            1500.0,
            500.0, // 500 advance recorded
            'card',
            null,
            '14:00:00'
        );

        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
        $this->assertSame('14:00:00', $stay['checkout_time']);
    }

    public function testCheckInFromReservationBlockedWhenRoomIsNotReady(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543299',
            'Cleaning Room Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            500.0,
            'cash',
            null
        );

        // Mark room as cleaning
        $this->roomRepo->updateHousekeeping($this->roomId, 'cleaning', null);

        try {
            $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
            $this->fail('Expected ApiException for room not ready was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertStringContainsString('is not ready', $e->getMessage());
            $this->assertArrayHasKey('room', $e->getFields());
        }

        // Now housekeeping marks room ready
        $this->roomRepo->updateHousekeeping($this->roomId, 'ok', null);

        // Check in now succeeds
        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
    }

    public function testBookingMaintenanceRoomIsPrevented(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Mark room under repair
        $this->roomRepo->updateHousekeeping($this->roomId, 'repair', 'Broken bathroom door');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('is under maintenance and cannot be booked');

        $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543298',
            'Maintenance Booker',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );
    }

    public function testRecordAdvancePaymentAllowsCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543213',
            'Late Advance Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );

        // Record advance payment separately
        $this->reservationService->recordAdvancePayment((int) $res['id'], self::HOTEL_ID, 400.0, 'upi', null);

        // Check in now succeeds
        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
    }

    public function testCheckInFromReservationWithAdvanceAtCheckInSucceeds(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543218',
            'Checkin Advance Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0, // No advance at booking
            'cash',
            null
        );

        // Advance collected during check-in: record payment successfully first, then allow check-in
        $this->reservationService->recordAdvancePayment((int) $res['id'], self::HOTEL_ID, 600.0, 'upi', null);
        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
        $this->assertNotNull($stay);
        $this->assertSame('in_house', $stay['status']);
    }

    public function testCheckInBlockedWhenPaymentIsPending(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543219',
            'Pending Payment Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );

        // Record a pending payment directly
        $this->paymentRepo->record(self::HOTEL_ID, (int) $res['id'], null, 'advance', 500.0, 'upi', null, 'Pending check', 'pending');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
    }

    public function testCheckInBlockedWhenPaymentIsFailed(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543220',
            'Failed Payment Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );

        // Record a failed payment directly
        $this->paymentRepo->record(self::HOTEL_ID, (int) $res['id'], null, 'advance', 500.0, 'upi', null, 'Failed check', 'failed');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
    }

    public function testCheckInBlockedWhenPaymentIsRefunded(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543221',
            'Refunded Payment Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            500.0,
            'cash',
            null
        );

        // Refund the advance payment
        $this->paymentRepo->record(self::HOTEL_ID, (int) $res['id'], null, 'refund', 500.0, 'cash', null, 'Full refund');

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
    }

    public function testPaymentBelongingToAnotherReservationCannotAuthorizeCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Booking 1 with payment
        $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543222',
            'Paid Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            500.0,
            'cash',
            null
        );

        // Booking 2 on another room without payment
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id) VALUES (99802, " . self::HOTEL_ID . ", 802, 8, 9981)");
        $res2 = $this->reservationService->create(
            self::HOTEL_ID,
            99802,
            '9876543223',
            'Unpaid Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        // Booking 2 check-in must fail even though booking 1 has payments
        $this->stayService->checkInFromReservation((int) $res2['id'], self::HOTEL_ID, null);
    }

    public function testFailedValidationDoesNotCreateStayOrOccupyRoom(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543224',
            'No Stay Test Guest',
            $today,
            $tomorrow,
            1,
            1500.0,
            0.0,
            'cash',
            null
        );

        try {
            $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);
        } catch (ApiException $e) {
            // expected
        }

        // Room must still be free, no in_house stays
        $inHouse = $this->roomRepo->inHouseStaysByRoom(self::HOTEL_ID);
        $this->assertArrayNotHasKey($this->roomId, $inHouse);

        $stmt = $this->db->prepare("SELECT COUNT(*) FROM stays WHERE reservation_id = :id");
        $stmt->execute(['id' => $res['id']]);
        $this->assertSame(0, (int) $stmt->fetchColumn());
    }

    public function testBookingBeyondRoomMaxPersonsIsPrevented(): void
    {
        $room = $this->roomRepo->find($this->roomId);
        $maxPersons = (int) $room['max_persons'];
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage("This room allows a maximum of {$maxPersons} persons.");

        $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543214',
            'Crowd Guest',
            $today,
            $tomorrow,
            $maxPersons + 1, // exceeds max_persons
            1500.0,
            200.0,
            'cash',
            null
        );
    }

    public function testDirectCheckInBeyondRoomMaxPersonsIsPrevented(): void
    {
        $room = $this->roomRepo->find($this->roomId);
        $maxPersons = (int) $room['max_persons'];

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage("This room allows a maximum of {$maxPersons} persons.");

        $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->roomId,
            '9876543215',
            'Crowd Walk-in',
            'Aadhaar',
            '123456789012',
            'Madurai',
            $maxPersons + 1,
            1,
            1500.0,
            500.0,
            'cash',
            null
        );
    }

    public function testCheckoutDateAndTimeEditable(): void
    {
        $checkIn = date('Y-m-d', strtotime('+2 days'));
        $checkOut = date('Y-m-d', strtotime('+4 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomId,
            '9876543216',
            'Time Edit Guest',
            $checkIn,
            $checkOut,
            1,
            1500.0,
            200.0,
            'cash',
            null,
            '15:30:00'
        );

        $this->assertSame('15:30:00', $res['check_out_time']);

        // Update checkout date & time
        $newCheckOut = date('Y-m-d', strtotime('+5 days'));
        $updated = $this->reservationService->update(
            (int) $res['id'],
            self::HOTEL_ID,
            $this->roomId,
            $checkIn,
            $newCheckOut,
            1,
            1500.0,
            200.0,
            'cash',
            null,
            '16:45:00',
            'Time Edit Guest Updated'
        );

        $this->assertSame($newCheckOut, $updated['check_out_date']);
        $this->assertSame('16:45:00', $updated['check_out_time']);
        $this->assertSame('Time Edit Guest Updated', $updated['guest_name']);
    }

    public function testGuestUpdateFunctionality(): void
    {
        $guest = $this->guestService->findOrCreate(
            self::HOTEL_ID, '9876543217', 'Original Name', 'Aadhaar', '123456789012', 'Original City'
        );

        $updated = $this->guestService->update(
            self::HOTEL_ID,
            (int) $guest['id'],
            [
                'name' => 'Updated Name',
                'city' => 'Updated City',
            ]
        );

        $this->assertSame('Updated Name', $updated['name']);
        $this->assertSame('Updated City', $updated['city']);
    }

    public function testRoomUpdateFunctionality(): void
    {
        $updated = $this->roomService->updateRoom(
            $this->roomId,
            801,
            8,
            9981,
            'Corner room with view',
            self::HOTEL_ID,
            null
        );

        $this->assertSame('Corner room with view', $updated['note']);
    }

    public function testInvoiceGstinUpdateFunctionality(): void
    {
        $invoice = $this->invoiceRepo->find(1);
        if ($invoice !== null) {
            $origGstin = $invoice['guest_gstin'];
            $this->invoiceRepo->updateGstin((int) $invoice['id'], '33ABCDE1234F1Z5');
            $updated = $this->invoiceRepo->find((int) $invoice['id']);
            $this->assertSame('33ABCDE1234F1Z5', $updated['guest_gstin']);
            // restore
            $this->invoiceRepo->updateGstin((int) $invoice['id'], $origGstin);
        } else {
            $this->assertTrue(true);
        }
    }
}
