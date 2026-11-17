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
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\OccupantDocumentService;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestDetailsSevenScenariosTest extends TestCase
{
    private GuestController $controller;

    protected function setUp(): void
    {
        $db = Connection::get();
        $audit = new AuditLogger(new AuditLogRepository($db));
        $guestRepo = new GuestRepository($db);
        $guestService = new GuestService($guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
        $stayRepo = new StayRepository($db);
        $reservationRepo = new ReservationRepository($db);
        $occupantRepo = new OccupantRepository($db);
        $occupantDocRepo = new OccupantDocumentRepository($db);
        $occupantDocUploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $stayRepo, $occupantDocUploader, $reservationRepo);
        $paymentRepo = new PaymentRepository($db);
        $settingsRepo = new SettingsRepository($db);
        $gstService = new GstService($settingsRepo);
        $hotelRepo = new HotelRepository($db);
        $billing = new BillingService($gstService, new StayChargeRepository($db), $paymentRepo, $settingsRepo, $hotelRepo);

        $this->controller = new GuestController(
            $guestRepo,
            $guestService,
            $stayRepo,
            $reservationRepo,
            $occupantDocService,
            $paymentRepo,
            $billing
        );
    }

    private function getGuest(int $guestId): array
    {
        $req = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => $guestId];
        return $this->controller->show($req);
    }

    /**
     * 1. Guest with no bookings (e.g. Guest 104905)
     */
    public function testScenario1GuestWithNoBookings(): void
    {
        $res = $this->getGuest(104905);
        $this->assertSame(104905, (int) $res['id']);
        $this->assertEmpty($res['bookings'], 'Guest with no bookings must have empty bookings list');
        $this->assertSame(0, (int) $res['summary']['totalVisits']);
        $this->assertSame('Not Staying', $res['summary']['currentStayStatus']);
        $this->assertNull($res['summary']['currentRoomNo']);
    }

    /**
     * 2. Guest with multiple bookings (e.g. Guest 100954 Luxy or Guest 100471 John Doe)
     */
    public function testScenario2GuestWithMultipleBookings(): void
    {
        $res = $this->getGuest(100954);
        $this->assertSame(100954, (int) $res['id']);
        $this->assertGreaterThan(1, count($res['bookings']), 'Guest 100954 must have multiple bookings');

        foreach ($res['bookings'] as $bk) {
            $this->assertArrayHasKey('id', $bk);
            $this->assertArrayHasKey('booking_code', $bk);
            $this->assertArrayHasKey('room_no', $bk);
            $this->assertArrayHasKey('check_in_date', $bk);
            $this->assertArrayHasKey('check_out_date', $bk);
            $this->assertArrayHasKey('persons', $bk);
            $this->assertArrayHasKey('booking_source', $bk);
            $this->assertArrayHasKey('status', $bk);
            $this->assertArrayHasKey('advance_amount', $bk);
        }
    }

    /**
     * 3. Guest with active stays with multiple occupants (e.g. Guest 27 Kalai)
     */
    public function testScenario3GuestWithActiveStayAndMultipleOccupants(): void
    {
        $res = $this->getGuest(27);
        $this->assertSame(27, (int) $res['id']);
        $this->assertNotNull($res['now']);
        $this->assertSame('in_house', $res['now']['type']);
        $this->assertSame(102, (int) $res['now']['roomNo']);

        $inHouseStay = null;
        foreach ($res['stays'] as $s) {
            if ($s['status'] === 'in_house') {
                $inHouseStay = $s;
                break;
            }
        }
        $this->assertNotNull($inHouseStay, 'Must have in_house stay');
        $this->assertSame(102, (int) $inHouseStay['room_no']);
        $this->assertSame(2, (int) $inHouseStay['persons']);
        $this->assertCount(2, $inHouseStay['occupants'], 'Must have 2 confirmed occupants');

        $primary = $inHouseStay['occupants'][0];
        $this->assertSame('Kalai', $primary['name']);
        $this->assertSame(1, (int) $primary['is_primary']);
        $this->assertSame('Female', $primary['gender']);

        $occupant2 = $inHouseStay['occupants'][1];
        $this->assertSame('Senthil', $occupant2['name']);
        $this->assertSame(0, (int) $occupant2['is_primary']);
        $this->assertSame('Male', $occupant2['gender']);
    }

    /**
     * 4. Guest with uploaded ID documents (e.g. Guest 27 Kalai)
     */
    public function testScenario4GuestWithUploadedIdDocuments(): void
    {
        $res = $this->getGuest(27);
        $this->assertNotEmpty($res['documents']);
        $docNames = array_column($res['documents'], 'original_filename');
        $this->assertContains('kalai_aadhaar.pdf', $docNames);
        $this->assertContains('senthil_passport.png', $docNames);

        foreach ($res['documents'] as $doc) {
            $this->assertArrayHasKey('original_filename', $doc);
            $this->assertArrayHasKey('document_type', $doc);
            $this->assertArrayHasKey('occupant_name', $doc);
            $this->assertArrayHasKey('uploaded_at', $doc);
        }
    }

    /**
     * 5. Guest with referral information (e.g. Guest 27 Kalai referred by John Doe, and Kalai referred Gayu)
     */
    public function testScenario5GuestWithReferralInformation(): void
    {
        $res = $this->getGuest(27);
        // Referred By
        $this->assertNotNull($res['referred_by']);
        $this->assertSame(100471, (int) $res['referred_by']['id']);
        $this->assertSame('John Doe', $res['referred_by']['name']);
        $this->assertSame('9876543210', $res['referred_by']['phone']);

        // People Referred
        $this->assertNotEmpty($res['referrals']);
        $referredGuest = $res['referrals'][0];
        $this->assertSame(104718, (int) $referredGuest['guest_id']);
        $this->assertSame('Gayu', $referredGuest['guest_name']);
        $this->assertSame('8364672819', $referredGuest['guest_phone']);
        $this->assertSame('BK-7390', $referredGuest['booking_code']);
        $this->assertSame('in_house', $referredGuest['status']);
    }

    /**
     * 6. Guest with advance payments and refunds (e.g. Guest 101208 Eeswaran)
     */
    public function testScenario6GuestWithAdvancePaymentsAndRefunds(): void
    {
        $res = $this->getGuest(101208);
        $this->assertNotEmpty($res['payments']);

        $types = array_column($res['payments'], 'type');
        $this->assertContains('advance', $types, 'Must contain advance payment');

        $this->assertGreaterThan(0.0, (float) $res['payment_summary']['advanceTotal']);
        $this->assertArrayHasKey('totalRoomCharges', $res['payment_summary']);
        $this->assertArrayHasKey('totalGst', $res['payment_summary']);
        $this->assertArrayHasKey('outstandingBalance', $res['payment_summary']);
    }

    /**
     * 7. Guest with completed stays (e.g. Guest 101208 Eeswaran)
     */
    public function testScenario7GuestWithCompletedStays(): void
    {
        $res = $this->getGuest(101208);
        $completedStay = null;
        foreach ($res['stays'] as $s) {
            if ($s['status'] === 'checked_out') {
                $completedStay = $s;
                break;
            }
        }
        $this->assertNotNull($completedStay, 'Guest 101208 must have a checked_out stay');
        $this->assertNotNull($completedStay['checkout_actual'], 'Completed stay must have checkout_actual');
        $this->assertSame(101, (int) $completedStay['room_no']);
        $this->assertSame(2, (int) $completedStay['persons']);
        $this->assertGreaterThanOrEqual(1, (int) $res['summary']['completedStays']);
    }
}
