<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Controller\GuestController;
use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HotelRepository;
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

final class AllReferralsRegisterTest extends TestCase
{
    private PDO $db;
    private GuestRepository $guestRepo;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private RoomRepository $roomRepo;
    private GuestController $guestController;
    private ReservationService $reservationService;
    private StayService $stayService;

    private int $referrerGuestId;
    private int $referredGuestId;
    private string $referredPhone;
    private int $testRoomId;

    /** @var int[] */
    private array $createdReservationIds = [];
    /** @var int[] */
    private array $createdStayIds = [];
    /** @var int[] */
    private array $createdGuestIds = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->guestRepo = new GuestRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->roomRepo = new RoomRepository($this->db);
        $roomRepo = $this->roomRepo;
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hotelRepo = new HotelRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $uploader = new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $guestService = new GuestService($this->guestRepo, $uploader, $audit);
        $gstService = new GstService($settingsRepo);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $paymentRepo, $settingsRepo, $hotelRepo);
        $invoiceService = new InvoiceService($this->db, new \App\Repository\InvoiceRepository($this->db), $hotelRepo, $gstService);

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $docUploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $this->stayRepo, $docUploader, $this->reservationRepo);

        $this->guestController = new GuestController(
            $this->guestRepo,
            $guestService,
            $this->stayRepo,
            $this->reservationRepo,
            $occupantDocService,
            $paymentRepo,
            $billing
        );

        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $roomRepo,
            $guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $audit,
            $this->stayRepo,
            $gstService,
            $occupantDocService
        );

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $roomRepo,
            new StayChargeRepository($this->db),
            $paymentRepo,
            new \App\Repository\HousekeepingLogRepository($this->db),
            $settingsRepo,
            $guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            $gstService,
            $occupantDocService
        );

        // Fetch a room
        $room = $roomRepo->allForHotel(1)[0] ?? null;
        $this->assertNotNull($room, 'At least one room must exist for hotel 1.');
        $this->testRoomId = (int) $room['id'];

        // Create Referrer Guest
        $referrerPhone = '911' . str_pad((string) mt_rand(1000000, 9999999), 7, '0', STR_PAD_LEFT);
        $this->referrerGuestId = $this->guestRepo->create(
            1,
            'Suresh Referrer',
            $referrerPhone,
            'Aadhaar',
            Crypto::encrypt('111122223333'),
            '3333',
            'Chennai',
            '12 Anna Salai, Chennai'
        );
        $this->createdGuestIds[] = $this->referrerGuestId;

        // Create Referred Guest
        $this->referredPhone = '922' . str_pad((string) mt_rand(1000000, 9999999), 7, '0', STR_PAD_LEFT);
        $this->referredGuestId = $this->guestRepo->create(
            1,
            'Ananya Referred',
            $this->referredPhone,
            'Aadhaar',
            Crypto::encrypt('444455556666'),
            '6666',
            'Madurai',
            '45 West Masi St, Madurai'
        );
        $this->createdGuestIds[] = $this->referredGuestId;
    }

    protected function tearDown(): void
    {
        foreach ($this->createdStayIds as $sid) {
            $this->db->exec("DELETE FROM invoices WHERE stay_id = {$sid}");
            $this->db->exec("DELETE FROM payments WHERE stay_id = {$sid}");
            $this->db->exec("DELETE FROM occupants WHERE stay_id = {$sid}");
            $this->db->exec("DELETE FROM stay_charges WHERE stay_id = {$sid}");
            $this->db->exec("DELETE FROM stays WHERE id = {$sid}");
        }
        foreach ($this->createdReservationIds as $rid) {
            $this->db->exec("DELETE FROM payments WHERE reservation_id = {$rid}");
            $this->db->exec("DELETE FROM reservations WHERE id = {$rid}");
        }
        foreach ($this->createdGuestIds as $gid) {
            $this->db->exec("DELETE FROM guests WHERE id = {$gid}");
        }
    }

    private function makeRequest(string $method, string $path, array $query = [], array $body = []): Request
    {
        $req = new Request($method, $path, $query, $body, [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        return $req;
    }

    public function testBookingCreationSavesReferredByGuestIdAndExcludesNonReferrals(): void
    {
        // 1. Create a referral booking using Reference – Existing Member
        $res = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-10',
            '2026-12-12',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            '11:00:00',
            'Special referral',
            'Reference – Existing Member',
            $this->referrerGuestId,
            null
        );
        $this->createdReservationIds[] = (int) $res['id'];

        // Confirm DB has saved referred_by_guest_id
        $dbRow = $this->reservationRepo->findWithDetails((int) $res['id']);
        $this->assertSame((int) $this->referrerGuestId, (int) $dbRow['referred_by_guest_id']);
        $this->assertSame('Reference – Existing Member', $dbRow['booking_source']);

        // 2. Create a non-referral booking (Social Media)
        $socialRes = $this->reservationService->create(
            1,
            $this->testRoomId,
            '9331234567',
            'Social Guest',
            '2026-12-15',
            '2026-12-16',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            '11:00:00',
            null,
            'Social Media',
            null,
            null
        );
        $this->createdReservationIds[] = (int) $socialRes['id'];

        // Query All Referrals via Controller
        $req = $this->makeRequest('GET', '/guests/referrals');
        $result = $this->guestController->allReferrals($req);

        $this->assertArrayHasKey('summary', $result);
        $this->assertArrayHasKey('items', $result);

        // Find our created booking in items
        $found = null;
        $socialFound = false;
        foreach ($result['items'] as $item) {
            if ((int) $item['reservation_id'] === (int) $res['id']) {
                $found = $item;
            }
            if ((int) $item['reservation_id'] === (int) $socialRes['id']) {
                $socialFound = true;
            }
        }

        $this->assertNotNull($found, 'Referral booking must be present in All Referrals items.');
        $this->assertFalse($socialFound, 'Social Media booking must NOT be present in All Referrals.');

        $this->assertSame('Suresh Referrer', $found['referrer_name']);
        $this->assertSame((int) $this->referrerGuestId, (int) $found['referrer_id']);
        $this->assertSame('Ananya Referred', $found['referred_guest_name']);
        $this->assertSame('Upcoming', $found['status']);
        $this->assertFalse($found['has_arrived']);
        $this->assertNull($found['actual_check_in']);
        $this->assertNull($found['actual_check_out']);
    }

    public function testAdvancePaymentMarksBookingAsConfirmedWithoutTreatingAsArrival(): void
    {
        // Create booking with advance payment
        $res = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-10',
            '2026-12-12',
            1,
            2000.0,
            500.0, // Advance paid
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId
        );
        $this->createdReservationIds[] = (int) $res['id'];

        $req = $this->makeRequest('GET', '/guests/referrals');
        $result = $this->guestController->allReferrals($req);

        $target = null;
        foreach ($result['items'] as $it) {
            if ((int) $it['reservation_id'] === (int) $res['id']) {
                $target = $it;
                break;
            }
        }

        $this->assertNotNull($target);
        $this->assertSame('Confirmed', $target['status']);
        $this->assertFalse($target['has_arrived'], 'Advance payment must NOT be treated as an arrival.');
        $this->assertNull($target['actual_check_in']);
    }

    public function testCheckInUpdatesStatusToInHouseAndMarksArrival(): void
    {
        $rooms = $this->roomRepo->allForHotel(1);
        $checkInRoomId = null;
        foreach ($rooms as $r) {
            if ($this->stayRepo->findInHouseByRoom((int) $r['id']) === null && ($r['housekeeping_status'] ?? '') !== 'repair') {
                $checkInRoomId = (int) $r['id'];
                break;
            }
        }
        $this->assertNotNull($checkInRoomId, 'Must find a room without an active in-house stay.');

        // 1. Create a referral booking
        $res = $this->reservationService->create(
            1,
            $checkInRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-05',
            '2026-12-07',
            1,
            2000.0,
            500.0,
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId
        );
        $resId = (int) $res['id'];
        $this->createdReservationIds[] = $resId;

        // Verify summary before arrival
        $req = $this->makeRequest('GET', '/guests/referrals');
        $before = $this->guestController->allReferrals($req);
        $arrivedBefore = $before['summary']['arrived_referred_guests'];

        // 2. Mark room ok and check in the reservation
        $this->db->prepare("UPDATE rooms SET housekeeping_status = 'ok' WHERE id = :id")->execute(['id' => $checkInRoomId]);
        $stay = $this->stayService->checkInFromReservation($resId, 1, 1, 1);
        $stayId = (int) $stay['id'];
        $this->createdStayIds[] = $stayId;

        // Query All Referrals again
        $after = $this->guestController->allReferrals($req);

        $target = null;
        foreach ($after['items'] as $it) {
            if ((int) $it['reservation_id'] === $resId) {
                $target = $it;
                break;
            }
        }

        $this->assertNotNull($target);
        $this->assertSame('In-House', $target['status']);
        $this->assertTrue($target['has_arrived']);
        $this->assertNotNull($target['actual_check_in']);
        $this->assertNull($target['actual_check_out']);

        // Arrived unique guests must have incremented by 1 (or stayed same if already arrived)
        $this->assertGreaterThanOrEqual($arrivedBefore, $after['summary']['arrived_referred_guests']);

        // 3. Complete Checkout
        $this->stayService->checkout($stayId, 1, 'cash', null, 1);

        $afterCheckout = $this->guestController->allReferrals($req);
        $targetAfter = null;
        foreach ($afterCheckout['items'] as $it) {
            if ((int) $it['reservation_id'] === $resId) {
                $targetAfter = $it;
                break;
            }
        }

        $this->assertNotNull($targetAfter);
        $this->assertSame('Checked Out', $targetAfter['status']);
        $this->assertTrue($targetAfter['has_arrived']);
        $this->assertNotNull($targetAfter['actual_check_in']);
        $this->assertNotNull($targetAfter['actual_check_out']);
    }

    public function testMultipleBookingsBySameGuestCountAsOneUniqueGuest(): void
    {
        // Initial summary
        $req = $this->makeRequest('GET', '/guests/referrals');
        $initial = $this->guestController->allReferrals($req);
        $initialTotalBookings = $initial['summary']['total_referral_bookings'];
        $initialUniqueGuests = $initial['summary']['unique_referred_guests'];

        // Booking 1 for Referred Guest
        $b1 = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-01',
            '2026-12-03',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId
        );
        $this->createdReservationIds[] = (int) $b1['id'];

        // Booking 2 for the SAME Referred Guest
        $b2 = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-20',
            '2026-12-22',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId
        );
        $this->createdReservationIds[] = (int) $b2['id'];

        $res = $this->guestController->allReferrals($req);

        // Total referral bookings increased by 2
        $this->assertSame($initialTotalBookings + 2, $res['summary']['total_referral_bookings']);

        // Unique referred guests increased by strictly 1 (since both bookings belong to Ananya)
        $this->assertSame($initialUniqueGuests + 1, $res['summary']['unique_referred_guests']);
    }

    public function testSearchAndStatusFilters(): void
    {
        $res = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-25',
            '2026-12-27',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId
        );
        $this->createdReservationIds[] = (int) $res['id'];

        // 1. Search by Referrer Name
        $req1 = $this->makeRequest('GET', '/guests/referrals', ['search' => 'Suresh Referrer']);
        $r1 = $this->guestController->allReferrals($req1);
        $this->assertNotEmpty($r1['items']);
        $this->assertSame('Suresh Referrer', $r1['items'][0]['referrer_name']);

        // 2. Search by non-matching string
        $req2 = $this->makeRequest('GET', '/guests/referrals', ['search' => 'NonExistentXYZ999']);
        $r2 = $this->guestController->allReferrals($req2);
        $this->assertEmpty($r2['items']);
        // Summary still reflects total database counts!
        $this->assertGreaterThan(0, $r2['summary']['total_referral_bookings']);

        // 3. Status filter 'upcoming'
        $req3 = $this->makeRequest('GET', '/guests/referrals', ['status' => 'upcoming']);
        $r3 = $this->guestController->allReferrals($req3);
        $foundUpcoming = false;
        foreach ($r3['items'] as $it) {
            if ((int) $it['reservation_id'] === (int) $res['id']) {
                $foundUpcoming = true;
            }
            $this->assertContains($it['status_code'], ['upcoming', 'confirmed']);
        }
        $this->assertTrue($foundUpcoming);
    }

    public function testOtherPersonReferralBookingAppearsInAllReferralsWithFreeTextName(): void
    {
        // Create booking with Booking Source = Other and Person Name = Selvi
        $res = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2026-12-28',
            '2026-12-30',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Other',
            null,
            'Selvi'
        );
        $resId = (int) $res['id'];
        $this->createdReservationIds[] = $resId;

        // Verify DB row
        $dbRow = $this->reservationRepo->findWithDetails($resId);
        $this->assertSame('Other', $dbRow['booking_source']);
        $this->assertSame('Selvi', $dbRow['other_source']);
        $this->assertNull($dbRow['referred_by_guest_id']);

        // Query All Referrals via Controller
        $req = $this->makeRequest('GET', '/guests/referrals');
        $result = $this->guestController->allReferrals($req);

        $found = null;
        foreach ($result['items'] as $item) {
            if ((int) ($item['reservation_id'] ?? 0) === $resId) {
                $found = $item;
                break;
            }
        }

        $this->assertNotNull($found, 'Other-person referral booking must appear in All Referrals.');
        $this->assertSame('Selvi', $found['referrer_name']);
        $this->assertNull($found['referrer_id']);
        $this->assertNull($found['referrer_phone']);
        $this->assertSame('other', $found['referral_type']);
        $this->assertSame('Other', $found['booking_source']);
        $this->assertSame('Ananya Referred', $found['referred_guest_name']);
        $this->assertSame($this->referredPhone, $found['referred_guest_phone']);
        $this->assertSame('Upcoming', $found['status']);

        // Test search by Other person name
        $reqSearch = $this->makeRequest('GET', '/guests/referrals', ['search' => 'Selvi']);
        $resSearch = $this->guestController->allReferrals($reqSearch);
        $this->assertNotEmpty($resSearch['items']);
        $this->assertSame('Selvi', $resSearch['items'][0]['referrer_name']);

        // Test referrer_search
        $reqRefSearch = $this->makeRequest('GET', '/guests/referrals', ['referrer_search' => 'Selvi']);
        $resRefSearch = $this->guestController->allReferrals($reqRefSearch);
        $this->assertNotEmpty($resRefSearch['items']);
        $this->assertSame('Selvi', $resRefSearch['items'][0]['referrer_name']);

        // Test type filter 'other'
        $reqTypeOther = $this->makeRequest('GET', '/guests/referrals', ['type' => 'other']);
        $resTypeOther = $this->guestController->allReferrals($reqTypeOther);
        $this->assertNotEmpty($resTypeOther['items']);
        foreach ($resTypeOther['items'] as $it) {
            $this->assertSame('other', $it['referral_type']);
        }
    }

    public function testDirectCheckInOtherPersonReferralAppearsInAllReferrals(): void
    {
        $rooms = $this->roomRepo->allForHotel(1);
        $directRoomId = null;
        foreach ($rooms as $r) {
            if ($this->stayRepo->findInHouseByRoom((int) $r['id']) === null && ($r['housekeeping_status'] ?? '') !== 'repair') {
                $directRoomId = (int) $r['id'];
                break;
            }
        }
        $this->assertNotNull($directRoomId, 'Must find a room for direct check-in.');
        $this->db->prepare("UPDATE rooms SET housekeeping_status = 'ok' WHERE id = :id")->execute(['id' => $directRoomId]);

        $directPhone = '944' . str_pad((string) mt_rand(1000000, 9999999), 7, '0', STR_PAD_LEFT);
        $stay = $this->stayService->directCheckIn(
            1,
            $directRoomId,
            $directPhone,
            'Walkin Direct Guest',
            'Aadhaar',
            '999988887777',
            'Tiruchi',
            1,
            2,
            2000.0,
            1000.0,
            'cash',
            1,
            null,
            'Other',
            null,
            'Ramesh Guide'
        );
        $stayId = (int) $stay['id'];
        $this->createdStayIds[] = $stayId;
        $guest = $this->guestRepo->findByPhone(1, $directPhone);
        if ($guest !== null) {
            $this->createdGuestIds[] = (int) $guest['id'];
        }

        // Verify database row
        $stayRow = $this->stayRepo->findWithDetails($stayId);
        $this->assertSame('Other', $stayRow['booking_source']);
        $this->assertSame('Ramesh Guide', $stayRow['other_source']);
        $this->assertNull($stayRow['referred_by_guest_id']);

        // Query All Referrals via Controller
        $req = $this->makeRequest('GET', '/guests/referrals');
        $result = $this->guestController->allReferrals($req);

        $found = null;
        foreach ($result['items'] as $item) {
            if ((int) ($item['stay_id'] ?? 0) === $stayId) {
                $found = $item;
                break;
            }
        }

        $this->assertNotNull($found, 'Direct check-in Other referral must appear in All Referrals.');
        $this->assertSame('Ramesh Guide', $found['referrer_name']);
        $this->assertNull($found['referrer_id']);
        $this->assertNull($found['referrer_phone']);
        $this->assertSame('other', $found['referral_type']);
        $this->assertSame('In-House', $found['status']);
        $this->assertTrue($found['has_arrived']);
        $this->assertSame('Walkin Direct Guest', $found['referred_guest_name']);
    }

    public function testBothExistingMemberAndOtherPersonReferralsCoexist(): void
    {
        // 1. Create Existing Member booking (referrer Suresh)
        $b1 = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2027-01-10',
            '2027-01-12',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Reference – Existing Member',
            $this->referrerGuestId,
            null
        );
        $this->createdReservationIds[] = (int) $b1['id'];

        // 2. Create Other person booking (referrer Selvi)
        $b2 = $this->reservationService->create(
            1,
            $this->testRoomId,
            $this->referredPhone,
            'Ananya Referred',
            '2027-01-15',
            '2027-01-17',
            1,
            2000.0,
            0.0,
            'cash',
            1,
            null,
            null,
            'Other',
            null,
            'Selvi'
        );
        $this->createdReservationIds[] = (int) $b2['id'];

        $req = $this->makeRequest('GET', '/guests/referrals');
        $result = $this->guestController->allReferrals($req);

        $foundMember = null;
        $foundOther = null;
        foreach ($result['items'] as $it) {
            if ((int) ($it['reservation_id'] ?? 0) === (int) $b1['id']) {
                $foundMember = $it;
            }
            if ((int) ($it['reservation_id'] ?? 0) === (int) $b2['id']) {
                $foundOther = $it;
            }
        }

        $this->assertNotNull($foundMember, 'Existing Member referral must be present.');
        $this->assertSame('Suresh Referrer', $foundMember['referrer_name']);
        $this->assertSame((int) $this->referrerGuestId, (int) $foundMember['referrer_id']);
        $this->assertSame('existing_member', $foundMember['referral_type']);

        $this->assertNotNull($foundOther, 'Other person referral must be present.');
        $this->assertSame('Selvi', $foundOther['referrer_name']);
        $this->assertNull($foundOther['referrer_id']);
        $this->assertSame('other', $foundOther['referral_type']);
    }
}
