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
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestStayAssociationAndValidationTest extends TestCase
{
    private PDO $db;
    private GuestController $guestController;
    private StayService $stayService;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private StayRepository $stayRepo;
    private ReservationRepository $reservationRepo;
    private PaymentRepository $paymentRepo;
    private OccupantRepository $occupantRepo;
    private OccupantDocumentService $occupantDocService;
    private RoomRepository $roomRepo;

    private const HOTEL_ID = 1;

    protected function setUp(): void
    {
        $this->db = Connection::get();

        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
        $this->stayRepo = new StayRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $occupantDocUploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $this->occupantDocService = new OccupantDocumentService(
            $this->occupantRepo,
            $occupantDocRepo,
            $this->stayRepo,
            $occupantDocUploader,
            $this->reservationRepo
        );
        $this->paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $gstService = new GstService($settingsRepo);
        $hotelRepo = new HotelRepository($this->db);
        $stayChargeRepo = new StayChargeRepository($this->db);
        $billing = new BillingService($gstService, $stayChargeRepo, $this->paymentRepo, $settingsRepo, $hotelRepo);
        $this->roomRepo = new RoomRepository($this->db);
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));
        $hkLogs = new HousekeepingLogRepository($this->db);

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            $stayChargeRepo,
            $this->paymentRepo,
            $hkLogs,
            $settingsRepo,
            $this->guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            $gstService,
            $this->occupantDocService
        );

        $this->guestController = new GuestController(
            $this->guestRepo,
            $this->guestService,
            $this->stayRepo,
            $this->reservationRepo,
            $this->occupantDocService,
            $this->paymentRepo,
            $billing
        );

        $this->cleanTestData();
    }

    protected function tearDown(): void
    {
        $this->cleanTestData();
    }

    private function cleanTestData(): void
    {
        $testPhones = ['9870001111', '9870002222', '9870003333', '9870004444', '9870005555', '9870006666', '9870007777', '9870008888'];
        $in = "'" . implode("','", $testPhones) . "'";
        $stmt = $this->db->query("SELECT id FROM guests WHERE phone IN ({$in})");
        $gids = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $stmt2 = $this->db->query("SELECT stay_id FROM occupants WHERE phone IN ({$in})");
        $sids = $stmt2->fetchAll(PDO::FETCH_COLUMN);

        if (!empty($gids)) {
            $gin = implode(',', $gids);
            $stmt3 = $this->db->query("SELECT id FROM stays WHERE guest_id IN ({$gin})");
            $sids = array_unique(array_merge($sids, $stmt3->fetchAll(PDO::FETCH_COLUMN)));
        }

        if (!empty($sids)) {
            $cleanSids = array_values(array_filter($sids));
            if (!empty($cleanSids)) {
                $sin = implode(',', $cleanSids);
                $this->db->exec("DELETE FROM occupant_documents WHERE occupant_id IN (SELECT id FROM occupants WHERE stay_id IN ({$sin}))");
                $this->db->exec("DELETE FROM occupants WHERE stay_id IN ({$sin})");
                $this->db->exec("DELETE FROM payments WHERE stay_id IN ({$sin})");
                $this->db->exec("DELETE FROM stays WHERE id IN ({$sin})");
            }
        }

        if (!empty($gids)) {
            $gin = implode(',', $gids);
            $this->db->exec("DELETE FROM payments WHERE reservation_id IN (SELECT id FROM reservations WHERE guest_id IN ({$gin}))");
            $this->db->exec("DELETE FROM reservations WHERE guest_id IN ({$gin})");
            $this->db->exec("DELETE FROM guests WHERE id IN ({$gin})");
        }
    }

    private function getGuestDetails(int $guestId): array
    {
        $req = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', self::HOTEL_ID);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => $guestId];
        return $this->guestController->show($req);
    }

    /**
     * Scenario 1: Normal individual booking and check-in.
     */
    public function testScenario1_NormalIndividualBookingAndCheckIn(): void
    {
        $phone = '9870001111';
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, $phone, 'Individual Guest');
        $guestId = (int) $guest['id'];

        $roomId = 15;
        $this->roomRepo->updateHousekeeping($roomId, 'ok', null);

        $resId = $this->reservationRepo->create(
            self::HOTEL_ID,
            'BK-NORM-001',
            $roomId,
            $guestId,
            date('Y-m-d'),
            date('Y-m-d', strtotime('+2 days')),
            1,
            1500.00,
            500.00,
            'cash',
            1
        );

        $this->paymentRepo->record(self::HOTEL_ID, $resId, null, 'advance', 500.00, 'cash', 1);

        $occupants = [
            ['name' => 'Individual Guest', 'gender' => 'Male', 'phone' => $phone],
        ];

        $stay = $this->stayService->checkInFromReservation($resId, self::HOTEL_ID, 1, 1, [], [], $occupants);

        $this->assertSame('in_house', $stay['status']);
        $this->assertSame($guestId, (int) $stay['guest_id']);
        $this->assertSame($resId, (int) $stay['reservation_id']);

        $stayOccupants = $this->occupantRepo->findByStay((int) $stay['id'], self::HOTEL_ID);
        $this->assertCount(1, $stayOccupants);
        $this->assertSame($guestId, (int) $stayOccupants[0]['guest_id']);
        $this->assertSame(1, (int) $stayOccupants[0]['is_primary']);
        $this->assertSame('Individual Guest', $stayOccupants[0]['name']);
    }

    /**
     * Scenario 2: Multiple-room group booking with different occupants.
     * Booking contact (Coordinator) books 2 rooms for two different travelers.
     */
    public function testScenario2_MultipleRoomGroupBookingWithDifferentOccupants(): void
    {
        $coordPhone = '9870002222';
        $coordGuest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, $coordPhone, 'Coordinator Smith');
        $coordGuestId = (int) $coordGuest['id'];

        $traveler1Phone = '9870003333';
        $traveler2Phone = '9870004444';

        $room1 = 15;
        $room2 = 16;
        $this->roomRepo->updateHousekeeping($room1, 'ok', null);
        $this->roomRepo->updateHousekeeping($room2, 'ok', null);

        // Reservation 1 for room 15
        $res1 = $this->reservationRepo->create(
            self::HOTEL_ID, 'BK-GRP-001', $room1, $coordGuestId, date('Y-m-d'), date('Y-m-d', strtotime('+1 day')),
            1, 1500.00, 500.00, 'cash', 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, $res1, null, 'advance', 500.00, 'cash', 1);

        // Reservation 2 for room 16
        $res2 = $this->reservationRepo->create(
            self::HOTEL_ID, 'BK-GRP-002', $room2, $coordGuestId, date('Y-m-d'), date('Y-m-d', strtotime('+1 day')),
            1, 1500.00, 500.00, 'cash', 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, $res2, null, 'advance', 500.00, 'cash', 1);

        // Check in Room 1 with Traveler 1
        $stay1 = $this->stayService->checkInFromReservation(
            $res1, self::HOTEL_ID, 1, 1, [], [],
            [['name' => 'Traveler Alpha', 'gender' => 'Male', 'phone' => $traveler1Phone]]
        );

        // Check in Room 2 with Traveler 2
        $stay2 = $this->stayService->checkInFromReservation(
            $res2, self::HOTEL_ID, 1, 1, [], [],
            [['name' => 'Traveler Beta', 'gender' => 'Female', 'phone' => $traveler2Phone]]
        );

        // Stays must belong to actual occupants, not coordinator!
        $this->assertNotEquals($coordGuestId, (int) $stay1['guest_id']);
        $this->assertNotEquals($coordGuestId, (int) $stay2['guest_id']);
        $this->assertSame('Traveler Alpha', $stay1['guest_name']);
        $this->assertSame('Traveler Beta', $stay2['guest_name']);

        // Coordinator's profile must have 0 active stays
        $coordProfile = $this->getGuestDetails($coordGuestId);
        $this->assertSame(0, count($coordProfile['stays']));
        $this->assertSame(0, (int) $coordProfile['summary']['totalVisits']);
        $this->assertSame('Not Staying', $coordProfile['summary']['currentStayStatus']);

        // But Coordinator has both bookings in their bookings tab
        $this->assertCount(2, $coordProfile['bookings']);
    }

    /**
     * Scenario 3: Same person attempting simultaneous check-in in different rooms.
     */
    public function testScenario3_SamePersonAttemptingSimultaneousCheckInInDifferentRooms(): void
    {
        $duplicatePhone = '9870005555';
        $guest = $this->guestService->findOrCreateMinimal(self::HOTEL_ID, $duplicatePhone, 'Simultaneous Guest');
        $guestId = (int) $guest['id'];

        $room1 = 15;
        $room2 = 16;
        $this->roomRepo->updateHousekeeping($room1, 'ok', null);
        $this->roomRepo->updateHousekeeping($room2, 'ok', null);

        // Direct check-in to Room 1
        $stay1 = $this->stayService->directCheckIn(
            self::HOTEL_ID, $room1, $duplicatePhone, 'Simultaneous Guest',
            'Aadhaar', '123456789012', 'Chennai', 1, 1, 1500.00, 500.00, 'cash', 1,
            occupants: [['name' => 'Simultaneous Guest', 'gender' => 'Male', 'phone' => $duplicatePhone]]
        );
        $this->assertSame('in_house', $stay1['status']);

        // Attempt check-in to Room 2 with the same person
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage("already has an active stay in Room 205");

        $this->stayService->directCheckIn(
            self::HOTEL_ID, $room2, $duplicatePhone, 'Simultaneous Guest',
            'Aadhaar', '123456789012', 'Chennai', 1, 1, 1500.00, 500.00, 'cash', 1,
            occupants: [['name' => 'Simultaneous Guest', 'gender' => 'Male', 'phone' => $duplicatePhone]]
        );
    }

    /**
     * Scenario 4: Different guests sharing the same phone number.
     * Family members sharing a mobile number must NOT be blocked.
     */
    public function testScenario4_DifferentGuestsSharingSamePhoneNumber(): void
    {
        $sharedPhone = '9870006666';
        $room1 = 15;
        $room2 = 16;
        $this->roomRepo->updateHousekeeping($room1, 'ok', null);
        $this->roomRepo->updateHousekeeping($room2, 'ok', null);

        // Husband checks into Room 1
        $stay1 = $this->stayService->directCheckIn(
            self::HOTEL_ID, $room1, $sharedPhone, 'Husband Kumar',
            'Aadhaar', '111122223333', 'Madurai', 1, 1, 1500.00, 500.00, 'cash', 1,
            occupants: [['name' => 'Husband Kumar', 'gender' => 'Male', 'phone' => $sharedPhone]]
        );
        $this->assertSame('in_house', $stay1['status']);

        // Wife checks into Room 2 with same phone but different name
        $stay2 = $this->stayService->directCheckIn(
            self::HOTEL_ID, $room2, $sharedPhone, 'Wife Kumar',
            'Aadhaar', '444455556666', 'Madurai', 1, 1, 1500.00, 500.00, 'cash', 1,
            occupants: [['name' => 'Wife Kumar', 'gender' => 'Female', 'phone' => $sharedPhone]]
        );
        $this->assertSame('in_house', $stay2['status']);

        // Both stays are successfully created
        $this->assertNotEquals($stay1['id'], $stay2['id']);
    }

    /**
     * Scenario 5: Additional occupants and primary guest associations.
     * Only primary occupant links to primary guest ID; additional occupant has guest_id = null.
     */
    public function testScenario5_AdditionalOccupantsAndPrimaryGuestAssociations(): void
    {
        $phone = '9870007777';
        $room = 15;
        $this->roomRepo->updateHousekeeping($room, 'ok', null);

        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $room, $phone, 'Primary Person',
            'Aadhaar', '999988887777', 'Salem', 2, 1, 2000.00, 1000.00, 'cash', 1,
            occupants: [
                ['name' => 'Primary Person', 'gender' => 'Male', 'phone' => $phone],
                ['name' => 'Accompanying Friend', 'gender' => 'Female', 'phone' => '9870008888'],
            ]
        );

        $occupants = $this->occupantRepo->findByStay((int) $stay['id'], self::HOTEL_ID);
        $this->assertCount(2, $occupants);

        // Primary occupant
        $this->assertSame(1, (int) $occupants[0]['is_primary']);
        $this->assertSame((int) $stay['guest_id'], (int) $occupants[0]['guest_id']);
        $this->assertSame('Primary Person', $occupants[0]['name']);

        // Additional occupant
        $this->assertSame(0, (int) $occupants[1]['is_primary']);
        $this->assertNull($occupants[1]['guest_id']);
        $this->assertSame('Accompanying Friend', $occupants[1]['name']);
    }

    /**
     * Scenario 6: Booking cancellation and advance refund (Luxy's genuine scenario).
     */
    public function testScenario6_BookingCancellationAndAdvanceRefund(): void
    {
        $luxy = $this->getGuestDetails(100954);

        $this->assertSame(100954, (int) $luxy['id']);
        $this->assertSame('Luxy', $luxy['name']);
        $this->assertSame('6545678900', $luxy['phone']);

        // Genuine booking BK-3256 is cancelled
        $this->assertCount(1, $luxy['bookings']);
        $this->assertSame('BK-3256', $luxy['bookings'][0]['booking_code']);
        $this->assertSame('cancelled', $luxy['bookings'][0]['status']);

        // Genuine payments: advance and refund
        $this->assertCount(2, $luxy['payments']);
        $types = array_column($luxy['payments'], 'type');
        $this->assertContains('advance', $types);
        $this->assertContains('refund', $types);

        // Advance ₹1000, Refund ₹900 -> net total paid ₹100 (which is the cancellation fee retained)
        $this->assertEqualsWithDelta(100.0, (float) $luxy['payment_summary']['totalPaid'], 0.01);
        $this->assertEqualsWithDelta(1000.0, (float) $luxy['payment_summary']['advanceTotal'], 0.01);
        $this->assertEqualsWithDelta(900.0, (float) $luxy['payment_summary']['refundTotal'], 0.01);
    }

    /**
     * Scenario 7: Guest stay history and visit count.
     */
    public function testScenario7_GuestStayHistoryAndVisitCount(): void
    {
        // Luxy has cancelled booking only -> 0 visits, 0 stays
        $luxy = $this->getGuestDetails(100954);
        $this->assertSame(0, (int) $luxy['summary']['totalVisits']);
        $this->assertSame(0, count($luxy['stays']));

        // Eeswaran (Guest 101208) has completed stays
        $eeswaran = $this->getGuestDetails(101208);
        $this->assertGreaterThanOrEqual(1, (int) $eeswaran['summary']['totalVisits']);
        $this->assertGreaterThanOrEqual(1, count($eeswaran['stays']));
    }

    /**
     * Scenario 8: Guest outstanding balance calculation.
     */
    public function testScenario8_GuestOutstandingBalanceCalculation(): void
    {
        // Luxy has no active stay -> outstanding balance is 0
        $luxy = $this->getGuestDetails(100954);
        $this->assertEqualsWithDelta(0.0, (float) $luxy['summary']['outstandingBalance'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $luxy['payment_summary']['outstandingBalance'], 0.01);

        // Kalai (Guest 27) has active in-house stay -> positive outstanding balance
        $kalai = $this->getGuestDetails(27);
        $this->assertGreaterThan(0.0, (float) $kalai['summary']['outstandingBalance']);
        $this->assertEquals(
            (float) $kalai['summary']['outstandingBalance'],
            (float) $kalai['payment_summary']['outstandingBalance']
        );
    }

    /**
     * Scenario 9: Web and mobile consistency.
     * Checks that the backend payload matches all contract fields needed by web and mobile.
     */
    public function testScenario9_WebAndMobileConsistency(): void
    {
        $luxy = $this->getGuestDetails(100954);

        // Essential profile fields
        $this->assertArrayHasKey('id', $luxy);
        $this->assertArrayHasKey('name', $luxy);
        $this->assertArrayHasKey('phone', $luxy);
        $this->assertArrayHasKey('email', $luxy);

        // Collections
        $this->assertArrayHasKey('bookings', $luxy);
        $this->assertArrayHasKey('stays', $luxy);
        $this->assertArrayHasKey('payments', $luxy);
        $this->assertArrayHasKey('documents', $luxy);
        $this->assertArrayHasKey('referrals', $luxy);
        $this->assertArrayHasKey('referred_by', $luxy);

        // Summaries
        $this->assertArrayHasKey('summary', $luxy);
        $this->assertArrayHasKey('payment_summary', $luxy);

        $summary = $luxy['summary'];
        $this->assertSame(0, (int) $summary['totalVisits']);
        $this->assertSame(0, (int) $summary['completedStays']);
        $this->assertSame('Not Staying', $summary['currentStayStatus']);
        $this->assertNull($summary['currentRoomNo']);
        $this->assertEqualsWithDelta(0.0, (float) $summary['outstandingBalance'], 0.01);

        $pSummary = $luxy['payment_summary'];
        $this->assertEqualsWithDelta(0.0, (float) $pSummary['outstandingBalance'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $pSummary['totalRoomCharges'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $pSummary['totalGst'], 0.01);

        // Ensure no unrelated stays appear
        $this->assertEmpty($luxy['stays']);
    }
}
