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
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\OccupantDocumentService;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestDetailsCompleteRetrievalTest extends TestCase
{
    private PDO $db;
    private GuestController $controller;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
        $stayRepo = new StayRepository($this->db);
        $reservationRepo = new ReservationRepository($this->db);
        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $occupantDocUploader = new OccupantDocumentUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $stayRepo, $occupantDocUploader, $reservationRepo);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $gstService = new GstService($settingsRepo);
        $hotelRepo = new HotelRepository($this->db);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $paymentRepo, $settingsRepo, $hotelRepo);

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

    public function testKalaiGuest27RetrievesAllAssociatedRecords(): void
    {
        $req = new Request('GET', '/guests/27', [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => 27];

        $res = $this->controller->show($req);

        // 1. Profile Information
        $this->assertSame(27, (int) $res['id']);
        $this->assertSame('Kalai', $res['name']);
        $this->assertSame('9840123456', $res['phone']);
        $this->assertNotNull($res['now']);
        $this->assertSame('in_house', $res['now']['type']);
        $this->assertSame(102, (int) $res['now']['roomNo']);

        // 2. Visit Summary
        $this->assertSame(1, (int) $res['summary']['totalVisits']);
        $this->assertSame('In-House', $res['summary']['currentStayStatus']);
        $this->assertSame(102, (int) $res['summary']['currentRoomNo']);
        $this->assertSame(1, (int) $res['summary']['referralsMade']);

        // 2b. Referral Information
        $this->assertNotNull($res['referred_by']);
        $this->assertSame(100471, (int) $res['referred_by']['id']);
        $this->assertSame('John Doe', $res['referred_by']['name']);
        $this->assertSame('9876543210', $res['referred_by']['phone']);

        // 3. Booking History
        $this->assertNotEmpty($res['bookings']);
        $bk = $res['bookings'][0];
        $this->assertSame('BK-1027', $bk['booking_code']);
        $this->assertSame('Reference – Existing Member', $bk['booking_source']);
        $this->assertSame('John Doe', $bk['referred_by_guest_name']);
        $this->assertSame(102, (int) $bk['room_no']);
        $this->assertSame(2, (int) $bk['persons']);
        $this->assertEqualsWithDelta(500.0, (float) $bk['advance_amount'], 0.01);
        $this->assertSame('checked_in', $bk['status']);
        $this->assertSame('partial', $bk['payment_status']);

        // 4. Stay History and Occupants
        $this->assertNotEmpty($res['stays']);
        $st = $res['stays'][0];
        $this->assertSame(102, (int) $st['room_no']);
        $this->assertSame(2, (int) $st['persons']);
        $this->assertSame('in_house', $st['status']);
        $this->assertNull($st['checkout_actual']);
        $this->assertCount(2, $st['occupants']);

        $occ1 = $st['occupants'][0];
        $this->assertSame('Kalai', $occ1['name']);
        $this->assertSame(1, (int) $occ1['is_primary']);
        $this->assertSame('Female', $occ1['gender']);

        $occ2 = $st['occupants'][1];
        $this->assertSame('Senthil', $occ2['name']);
        $this->assertSame(0, (int) $occ2['is_primary']);
        $this->assertSame('Male', $occ2['gender']);

        // 5. ID Proof Documents
        $this->assertCount(2, $res['documents']);
        $docNames = array_column($res['documents'], 'original_filename');
        $this->assertContains('kalai_aadhaar.pdf', $docNames);
        $this->assertContains('senthil_passport.png', $docNames);

        // 6. Payments
        $this->assertCount(2, $res['payments']);
        $this->assertEqualsWithDelta(1500.0, (float) $res['payment_summary']['totalPaid'], 0.01);
        $this->assertEqualsWithDelta(500.0, (float) $res['payment_summary']['advanceTotal'], 0.01);
        $this->assertEqualsWithDelta(1000.0, (float) $res['payment_summary']['additionalTotal'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $res['payment_summary']['refundTotal'], 0.01);

        $nights = BillingService::nightsBetween('2026-11-16', date('Y-m-d'));
        $expectedRoomCharges = 2200.0 * $nights;
        $expectedGst = $expectedRoomCharges * 0.05;
        $expectedOutstanding = ($expectedRoomCharges + $expectedGst) - 1500.0;

        $this->assertEqualsWithDelta($expectedRoomCharges, (float) $res['payment_summary']['totalRoomCharges'], 0.01);
        $this->assertEqualsWithDelta($expectedGst, (float) $res['payment_summary']['totalGst'], 0.01);
        $this->assertEqualsWithDelta($expectedOutstanding, (float) $res['payment_summary']['outstandingBalance'], 0.01);
    }

    public function testReferrerGuestDetailsShowsKalaiUnderPeopleReferred(): void
    {
        $req = new Request('GET', '/guests/100471', [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => 100471];

        $res = $this->controller->show($req);

        $this->assertNotEmpty($res['referrals']);
        $foundKalai = false;
        foreach ($res['referrals'] as $ref) {
            if ($ref['guest_name'] === 'Kalai' && (int) $ref['guest_id'] === 27) {
                $foundKalai = true;
                $this->assertSame('BK-1027', $ref['booking_code']);
                $this->assertSame(102, (int) $ref['room_no']);
                $this->assertSame('in_house', $ref['status']);
                $this->assertSame('9840123456', $ref['guest_phone']);
            }
        }
        $this->assertTrue($foundKalai, 'Kalai must appear in John Doe\'s referral history.');
    }

    public function testGuestDataIsolationAcrossDifferentGuests(): void
    {
        $req = new Request('GET', '/guests/101208', [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);
        $req->routeParams = ['id' => 101208];

        $res = $this->controller->show($req);

        // Eeswaran must not have Kalai's records
        $this->assertSame('Eeswaran', $res['name']);
        foreach ($res['bookings'] as $b) {
            $this->assertNotSame('BK-1027', $b['booking_code']);
        }
        foreach ($res['stays'] as $s) {
            $this->assertNotSame(102, (int) $s['room_no']);
        }
        foreach ($res['referrals'] as $r) {
            $this->assertNotSame('Kalai', $r['guest_name']);
        }
    }
}
