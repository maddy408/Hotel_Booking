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
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Repository\HotelRepository;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class BookingSourceTest extends TestCase
{
    private const HOTEL_ID = 996;
    private const OTHER_HOTEL_ID = 995;
    private PDO $db;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private ReservationService $reservationService;
    private StayService $stayService;

    private int $roomId;
    private int $referringGuestId;
    private int $otherHotelGuestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Booking Source Hotel', 'Chennai')");
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::OTHER_HOTEL_ID . ", 'Other Hotel', 'Madurai')");

        $this->db->exec("INSERT INTO settings (hotel_id, checkout_hour) VALUES (" . self::HOTEL_ID . ", 12)");
        $this->db->exec("INSERT INTO settings (hotel_id, checkout_hour) VALUES (" . self::OTHER_HOTEL_ID . ", 12)");

        $this->db->exec("INSERT INTO room_types (hotel_id, code, name, rate, max_persons) VALUES (" . self::HOTEL_ID . ", 'STD', 'Standard', 2000.00, 2)");
        $typeId = (int) $this->db->lastInsertId();
        $this->db->exec("INSERT INTO rooms (hotel_id, room_type_id, room_no, floor, housekeeping_status) VALUES (" . self::HOTEL_ID . ", {$typeId}, 501, 5, 'ok')");
        $this->roomId = (int) $this->db->lastInsertId();

        $this->guestRepo = new GuestRepository($this->db);
        $this->referringGuestId = $this->guestRepo->create(self::HOTEL_ID, 'Alice Referrer', '9876543210', 'Aadhaar', null, '1234', 'Chennai');
        $this->otherHotelGuestId = $this->guestRepo->create(self::OTHER_HOTEL_ID, 'Bob Stranger', '9123456780', 'Aadhaar', null, '5678', 'Madurai');

        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->guestService = new GuestService($this->guestRepo, null, $audit);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $roomRepo = new RoomRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hotelRepo = new HotelRepository($this->db);
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $gstService = new GstService($settingsRepo);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $paymentRepo, $settingsRepo, $hotelRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db), $hotelRepo, $gstService);

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $roomRepo, $this->guestService,
            $availability, $paymentRepo, $settingsRepo, $audit, $this->stayRepo, $gstService
        );

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $roomRepo,
            new StayChargeRepository($this->db), $paymentRepo, new HousekeepingLogRepository($this->db),
            $settingsRepo, $this->guestService, $availability, $billing, $invoiceService, $audit, $gstService
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stays WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM reservations WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM room_types WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM guests WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM settings WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM hotels WHERE id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
    }

    public function testCreateReservationWithSocialMedia(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991112222', 'Guest Social',
            date('Y-m-d', strtotime('+10 days')), date('Y-m-d', strtotime('+12 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', 'Notes',
            'Social Media', null, null
        );

        $this->assertSame('Social Media', $res['booking_source']);
        $this->assertNull($res['referred_by_guest_id']);
        $this->assertNull($res['other_source']);
    }

    public function testCreateReservationWithExistingMemberReference(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991113333', 'Guest Referred',
            date('Y-m-d', strtotime('+15 days')), date('Y-m-d', strtotime('+17 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referringGuestId, null
        );

        $this->assertSame('Reference – Existing Member', $res['booking_source']);
        $this->assertSame($this->referringGuestId, (int) $res['referred_by_guest_id']);
        $this->assertSame('Alice Referrer', $res['referred_by_guest_name']);
        $this->assertSame('9876543210', $res['referred_by_guest_phone']);
        $this->assertNull($res['other_source']);
    }

    public function testCreateReservationFailsIfReferringGuestBelongsToAnotherHotel(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Selected referring guest does not belong to this hotel.');

        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991114444', 'Guest Cross Hotel',
            date('Y-m-d', strtotime('+20 days')), date('Y-m-d', strtotime('+22 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->otherHotelGuestId, null
        );
    }

    public function testCreateReservationWithOtherSource(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991115555', 'Guest Other',
            date('Y-m-d', strtotime('+25 days')), date('Y-m-d', strtotime('+27 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Other', null, 'John Promoter'
        );

        $this->assertSame('Other', $res['booking_source']);
        $this->assertNull($res['referred_by_guest_id']);
        $this->assertSame('John Promoter', $res['other_source']);
    }

    public function testTransferSourceValuesFromReservationToStayOnCheckIn(): void
    {
        $today = date('Y-m-d');
        $out = date('Y-m-d', strtotime('+2 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991116666', 'Guest For CheckIn',
            $today, $out,
            2, 2000.00, 1000.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referringGuestId, null
        );

        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);

        $this->assertSame('Reference – Existing Member', $stay['booking_source']);
        $this->assertSame($this->referringGuestId, (int) $stay['referred_by_guest_id']);
        $this->assertSame('Alice Referrer', $stay['referred_by_guest_name']);
        $this->assertSame('9876543210', $stay['referred_by_guest_phone']);
        $this->assertNull($stay['other_source']);
    }

    public function testDirectCheckInWithOtherSource(): void
    {
        // First clean up room to ensure it is free
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);

        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9998887777', 'Direct Guest',
            'Aadhaar', '998877665544', 'Coimbatore',
            2, 1, 2000.00, 1000.00, 'cash', null, '12:00:00',
            'Other', null, 'Corporate Sales Rep'
        );

        $this->assertSame('Other', $stay['booking_source']);
        $this->assertNull($stay['referred_by_guest_id']);
        $this->assertSame('Corporate Sales Rep', $stay['other_source']);
    }

    public function testUpdateReservationBookingSource(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9990001111', 'Update Test Guest',
            date('Y-m-d', strtotime('+30 days')), date('Y-m-d', strtotime('+32 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Social Media', null, null
        );

        $this->assertSame('Social Media', $res['booking_source']);

        // Update to Reference – Existing Member
        $updated = $this->reservationService->update(
            (int) $res['id'], self::HOTEL_ID, $this->roomId,
            date('Y-m-d', strtotime('+30 days')), date('Y-m-d', strtotime('+32 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00',
            'Update Test Guest', '9990001111', 'Updated notes', null,
            'Reference – Existing Member', $this->referringGuestId, null
        );

        $this->assertSame('Reference – Existing Member', $updated['booking_source']);
        $this->assertSame($this->referringGuestId, (int) $updated['referred_by_guest_id']);
        $this->assertSame('Alice Referrer', $updated['referred_by_guest_name']);
        $this->assertNull($updated['other_source']);

        // Update to Other
        $updated2 = $this->reservationService->update(
            (int) $res['id'], self::HOTEL_ID, $this->roomId,
            date('Y-m-d', strtotime('+30 days')), date('Y-m-d', strtotime('+32 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00',
            'Update Test Guest', '9990001111', 'Updated notes', null,
            'Other', null, 'Local Taxi Driver'
        );

        $this->assertSame('Other', $updated2['booking_source']);
        $this->assertNull($updated2['referred_by_guest_id']);
        $this->assertSame('Local Taxi Driver', $updated2['other_source']);
    }

    public function testCreateReservationValidationFailsWhenReferenceMemberMissingId(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please select an existing member as reference.');

        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991118888', 'Guest Missing Ref',
            date('Y-m-d', strtotime('+35 days')), date('Y-m-d', strtotime('+37 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', null, null
        );
    }

    public function testCreateReservationValidationFailsWhenOtherSourceMissingName(): void
    {
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter person name for reference.');

        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9991119999', 'Guest Missing Other',
            date('Y-m-d', strtotime('+40 days')), date('Y-m-d', strtotime('+42 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Other', null, '   '
        );
    }

    public function testDirectCheckInWithReferenceMember(): void
    {
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);

        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9992223333', 'Direct Ref Guest',
            'Driving Licence', 'DL99887766', 'Trichy',
            2, 1, 2000.00, 1000.00, 'cash', null, '12:00:00',
            'Reference – Existing Member', $this->referringGuestId, null
        );

        $this->assertSame('Reference – Existing Member', $stay['booking_source']);
        $this->assertSame($this->referringGuestId, (int) $stay['referred_by_guest_id']);
        $this->assertSame('Alice Referrer', $stay['referred_by_guest_name']);
        $this->assertSame('9876543210', $stay['referred_by_guest_phone']);
        $this->assertNull($stay['other_source']);
    }

    public function testListPendingReservationsIncludesSourceAndReferenceDetails(): void
    {
        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9993334444', 'Pending List Guest',
            date('Y-m-d', strtotime('+50 days')), date('Y-m-d', strtotime('+52 days')),
            2, 2000.00, 500.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referringGuestId, null
        );

        $pending = $this->reservationService->list(self::HOTEL_ID);
        $this->assertNotEmpty($pending);
        $found = null;
        foreach ($pending as $item) {
            if ($item['guest_name'] === 'Pending List Guest') {
                $found = $item;
                break;
            }
        }
        $this->assertNotNull($found);
        $this->assertSame('Reference – Existing Member', $found['booking_source']);
        $this->assertSame($this->referringGuestId, (int) $found['referred_by_guest_id']);
        $this->assertSame('Alice Referrer', $found['referred_by_guest_name']);
        $this->assertSame('9876543210', $found['referred_by_guest_phone']);
    }

    public function testTransferOtherSourceFromReservationToStayOnCheckIn(): void
    {
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $today = date('Y-m-d');
        $out = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9995556666', 'Other CheckIn Guest',
            $today, $out,
            2, 2000.00, 1000.00, 'cash', null, '12:00:00', null,
            'Other', null, 'Billboard at Airport'
        );

        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);

        $this->assertSame('Other', $stay['booking_source']);
        $this->assertNull($stay['referred_by_guest_id']);
        $this->assertSame('Billboard at Airport', $stay['other_source']);
    }
}
