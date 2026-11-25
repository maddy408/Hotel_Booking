<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Controller\GuestController;
use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HotelRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\OccupantDocumentService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\AuditLogger;
use App\Support\Crypto;
use App\Support\IdImageUploader;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestReferralsTest extends TestCase
{
    private const HOTEL_ID = 993;
    private const OTHER_HOTEL_ID = 994;

    private PDO $db;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private GuestController $guestController;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private ReservationService $reservationService;
    private StayService $stayService;

    private int $roomId;
    private int $referrerArjunId;
    private int $unrelatedGuestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'KKK Lodge Referral Test', 'Chennai')");
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::OTHER_HOTEL_ID . ", 'Other Hotel', 'Madurai')");

        $this->db->exec("INSERT INTO settings (hotel_id, checkout_hour) VALUES (" . self::HOTEL_ID . ", 12)");
        $this->db->exec("INSERT INTO settings (hotel_id, checkout_hour) VALUES (" . self::OTHER_HOTEL_ID . ", 12)");

        $this->db->exec("INSERT INTO room_types (hotel_id, code, name, rate, max_persons) VALUES (" . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2500.00, 2)");
        $typeId = (int) $this->db->lastInsertId();
        $this->db->exec("INSERT INTO rooms (hotel_id, room_type_id, room_no, floor, housekeeping_status) VALUES (" . self::HOTEL_ID . ", {$typeId}, 301, 3, 'ok')");
        $this->roomId = (int) $this->db->lastInsertId();

        $this->guestRepo = new GuestRepository($this->db);
        $this->referrerArjunId = $this->guestRepo->create(
            self::HOTEL_ID,
            'Arjun Mehta',
            '9840123456',
            'Aadhaar',
            Crypto::encrypt('123412341234'),
            '1234',
            'Chennai',
            'arjun.mehta@example.com',
            '10 Cathedral Road'
        );

        $this->unrelatedGuestId = $this->guestRepo->create(
            self::HOTEL_ID,
            'Unrelated Guest Suresh',
            '9840999888',
            'Aadhaar',
            Crypto::encrypt('567856785678'),
            '5678',
            'Coimbatore',
            'suresh@example.com',
            '55 Cross Cut Road'
        );

        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
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

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $uploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $this->stayRepo, $uploader, $this->reservationRepo);

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $roomRepo, $this->guestService,
            $availability, $paymentRepo, $settingsRepo, $audit, $this->stayRepo, $gstService, $occupantDocService
        );

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $roomRepo,
            new StayChargeRepository($this->db), $paymentRepo, new HousekeepingLogRepository($this->db),
            $settingsRepo, $this->guestService, $availability, $billing, $invoiceService, $audit, $gstService
        );

        $this->guestController = new GuestController(
            $this->guestRepo,
            $this->guestService,
            $this->stayRepo,
            $this->reservationRepo,
            $occupantDocService,
            $paymentRepo,
            $billing
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

    /** Case 1: Select Social Media and create booking. Booking details should show Social Media. */
    public function testCase1SocialMediaBooking(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111001', 'Social Media Guest',
            date('Y-m-d', strtotime('+5 days')), date('Y-m-d', strtotime('+7 days')),
            1, 2500.00, 500.00, 'cash', null, '12:00:00', null,
            'Social Media', null, null
        );

        $details = $this->reservationRepo->findWithDetails((int) $res['id']);
        $this->assertNotNull($details);
        $this->assertSame('Social Media', $details['booking_source']);
        $this->assertNull($details['referred_by_guest_id']);
        $this->assertNull($details['referred_by_guest_name']);
        $this->assertNull($details['referred_by_guest_phone']);
        $this->assertNull($details['other_source']);
    }

    /** Case 2: Select Reference and choose existing guest. Booking details should show correct referrer name and mobile. */
    public function testCase2ReferenceBookingShowsReferrerInfo(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111002', 'Karthik Ramasamy',
            date('Y-m-d', strtotime('+10 days')), date('Y-m-d', strtotime('+12 days')),
            2, 2500.00, 1000.00, 'upi', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        $details = $this->reservationRepo->findWithDetails((int) $res['id']);
        $this->assertNotNull($details);
        $this->assertSame('Reference – Existing Member', $details['booking_source']);
        $this->assertSame($this->referrerArjunId, (int) $details['referred_by_guest_id']);
        $this->assertSame('Arjun Mehta', $details['referred_by_guest_name']);
        $this->assertSame('9840123456', $details['referred_by_guest_phone']);
        $this->assertNull($details['other_source']);
    }

    private function createRequest(string $method, string $path, array $routeParams = [], array $attributes = []): Request
    {
        $req = new Request($method, $path, [], [], [], '127.0.0.1');
        $req->routeParams = $routeParams;
        foreach ($attributes as $k => $v) {
            $req->setAttribute($k, $v);
        }
        return $req;
    }

    /** Case 3: Open referrer's Guest Details page. The newly referred guest should appear under People Referred by This Guest. */
    public function testCase3ReferrerGuestDetailsShowsNewlyReferredGuest(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111003', 'Karthik Ramasamy',
            date('Y-m-d', strtotime('+15 days')), date('Y-m-d', strtotime('+18 days')),
            2, 2500.00, 1000.00, 'upi', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        $req = $this->createRequest('GET', "/guests/{$this->referrerArjunId}", ['id' => (string) $this->referrerArjunId], ['hotelId' => self::HOTEL_ID]);
        $guestDetails = $this->guestController->show($req);

        $this->assertSame('Arjun Mehta', $guestDetails['name']);
        $this->assertArrayHasKey('referred_guests', $guestDetails);
        $this->assertArrayHasKey('referrals', $guestDetails);
        $this->assertCount(1, $guestDetails['referred_guests']);

        $ref = $guestDetails['referred_guests'][0];
        $this->assertSame('Karthik Ramasamy', $ref['guest_name']);
        $this->assertSame('9840111003', $ref['guest_phone']);
        $this->assertSame($res['booking_code'], $ref['booking_code']);
        $this->assertSame(301, (int) $ref['room_no']);
        $this->assertSame($res['check_in_date'], $ref['check_in_date']);
        $this->assertSame('pending', $ref['status']);
    }

    /** Case 4: Refer multiple guests using the same referrer. All should appear in the referral history. */
    public function testCase4ReferMultipleGuestsAllAppearInHistory(): void
    {
        // Refer Karthik Ramasamy
        $res1 = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111004', 'Karthik Ramasamy',
            date('Y-m-d', strtotime('+20 days')), date('Y-m-d', strtotime('+22 days')),
            2, 2500.00, 1000.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        // Refer Divya Krishnan
        $res2 = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111005', 'Divya Krishnan',
            date('Y-m-d', strtotime('+25 days')), date('Y-m-d', strtotime('+27 days')),
            1, 2500.00, 1000.00, 'upi', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        $req = $this->createRequest('GET', "/guests/{$this->referrerArjunId}", ['id' => (string) $this->referrerArjunId], ['hotelId' => self::HOTEL_ID]);
        $guestDetails = $this->guestController->show($req);

        $this->assertCount(2, $guestDetails['referred_guests']);
        $names = array_column($guestDetails['referred_guests'], 'guest_name');
        $this->assertContains('Karthik Ramasamy', $names);
        $this->assertContains('Divya Krishnan', $names);
    }

    /** Case 5: Select Other and enter a person's name. Booking Details should show that name. */
    public function testCase5OtherSourceBookingShowsEnteredPersonName(): void
    {
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111006', 'Guest With Other Source',
            date('Y-m-d', strtotime('+30 days')), date('Y-m-d', strtotime('+32 days')),
            1, 2500.00, 500.00, 'card', null, '12:00:00', null,
            'Other', null, 'Rajesh Tour Agent'
        );

        $details = $this->reservationRepo->findWithDetails((int) $res['id']);
        $this->assertSame('Other', $details['booking_source']);
        $this->assertSame('Rajesh Tour Agent', $details['other_source']);
        $this->assertNull($details['referred_by_guest_id']);
    }

    /** Case 6: Open unrelated guest profiles. They must not show incorrect referral records. */
    public function testCase6UnrelatedGuestShowsEmptyReferralsWithoutLeakage(): void
    {
        // Arjun refers someone
        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111007', 'Karthik Ramasamy',
            date('Y-m-d', strtotime('+35 days')), date('Y-m-d', strtotime('+37 days')),
            2, 2500.00, 1000.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        // Check unrelated guest Suresh
        $req = $this->createRequest('GET', "/guests/{$this->unrelatedGuestId}", ['id' => (string) $this->unrelatedGuestId], ['hotelId' => self::HOTEL_ID]);
        $guestDetails = $this->guestController->show($req);

        $this->assertSame('Unrelated Guest Suresh', $guestDetails['name']);
        $this->assertSame([], $guestDetails['referred_guests']);
        $this->assertSame([], $guestDetails['referrals']);

        // Also test the dedicated endpoint
        $reqReferrals = $this->createRequest('GET', "/guests/{$this->unrelatedGuestId}/referrals", ['id' => (string) $this->unrelatedGuestId], ['hotelId' => self::HOTEL_ID]);
        $referralList = $this->guestController->referrals($reqReferrals);
        $this->assertSame([], $referralList);
    }

    /** Case 7: Refresh pages / persistent records: referral information remains correct across queries and check-ins. */
    public function testCase7PersistenceAndStatusAfterCheckIn(): void
    {
        $today = date('Y-m-d');
        $out = date('Y-m-d', strtotime('+2 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9840111008', 'Persistent Referred Guest',
            $today, $out,
            2, 2500.00, 1000.00, 'cash', null, '12:00:00', null,
            'Reference – Existing Member', $this->referrerArjunId, null
        );

        // Initially status is pending
        $refsInitial = $this->guestRepo->getReferredGuests($this->referrerArjunId, self::HOTEL_ID);
        $this->assertCount(1, $refsInitial);
        $this->assertSame('pending', $refsInitial[0]['status']);

        // Check in reservation
        $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, null);

        // After check-in, status in referral history reflects active stay (in_house)
        $refsAfterCheckIn = $this->guestRepo->getReferredGuests($this->referrerArjunId, self::HOTEL_ID);
        $this->assertCount(1, $refsAfterCheckIn);
        $this->assertSame('in_house', $refsAfterCheckIn[0]['status']);
        $this->assertSame('Persistent Referred Guest', $refsAfterCheckIn[0]['guest_name']);
        $this->assertSame($res['booking_code'], $refsAfterCheckIn[0]['booking_code']);
        $this->assertSame(301, (int) $refsAfterCheckIn[0]['room_no']);
    }
}
