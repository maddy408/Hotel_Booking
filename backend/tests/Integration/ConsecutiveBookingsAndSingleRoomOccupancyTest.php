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
use App\Repository\OccupantRepository;
use App\Repository\OccupantDocumentRepository;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GuestService;
use App\Service\GstService;
use App\Service\InvoiceService;
use App\Service\OccupantDocumentService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class ConsecutiveBookingsAndSingleRoomOccupancyTest extends TestCase
{
    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private RoomRepository $roomRepo;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private GuestService $guestService;

    protected function setUp(): void
    {
        $this->db = Connection::get();

        $this->stayRepo = new StayRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkLogRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $stayChargeRepo = new StayChargeRepository($this->db);
        $invoiceRepo = new InvoiceRepository($this->db);
        $guestRepo = new GuestRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));

        $gstService = new GstService($settingsRepo);
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $billing = new BillingService($gstService, $stayChargeRepo, $paymentRepo);
        $invoiceService = new InvoiceService($this->db, $invoiceRepo);
        $this->guestService = new GuestService($guestRepo);

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $uploader = new \App\Support\OccupantDocumentUploader(__DIR__ . '/../../public/uploads/occupants');
        $occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $this->stayRepo, $uploader, $this->reservationRepo);

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            $stayChargeRepo,
            $paymentRepo,
            $hkLogRepo,
            $settingsRepo,
            $this->guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            $gstService,
            $occupantDocService
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $this->roomRepo,
            $this->guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $audit,
            $this->stayRepo,
            $gstService,
            $occupantDocService
        );

        $this->roomService = new RoomService(
            $this->roomRepo,
            $roomTypeRepo,
            $hkLogRepo,
            $audit
        );
    }

    protected function tearDown(): void
    {
        if ($this->db->inTransaction()) {
            $this->db->rollBack();
        }
        $room = $this->roomRepo->findByRoomNo(1, 9999);
        if ($room !== null) {
            $roomId = (int) $room['id'];
            $this->cleanRoomData($roomId);
            $this->roomRepo->delete($roomId);
        }
    }

    private function cleanRoomData(int $roomId): void
    {
        $this->db->prepare("DELETE i FROM invoices i JOIN stays s ON s.id = i.stay_id WHERE s.room_id = :r")->execute(['r' => $roomId]);
        $this->db->prepare("DELETE p FROM payments p JOIN stays s ON s.id = p.stay_id WHERE s.room_id = :r")->execute(['r' => $roomId]);
        $this->db->prepare("DELETE p FROM payments p JOIN reservations res ON res.id = p.reservation_id WHERE res.room_id = :r")->execute(['r' => $roomId]);
        $this->db->prepare("DELETE o FROM occupants o JOIN stays s ON s.id = o.stay_id WHERE s.room_id = :r")->execute(['r' => $roomId]);
        $this->db->prepare("DELETE FROM stays WHERE room_id = :r")->execute(['r' => $roomId]);
        $this->db->prepare("DELETE FROM reservations WHERE room_id = :r")->execute(['r' => $roomId]);
    }

    private function findOrCreateCleanRoom(): int
    {
        $room = $this->roomRepo->findByRoomNo(1, 9999);
        if ($room === null) {
            $roomId = $this->roomRepo->insert(1, 9999, 9, 1);
        } else {
            $roomId = (int) $room['id'];
        }

        $this->cleanRoomData($roomId);
        $this->roomRepo->updateHousekeeping($roomId, 'ok', null);

        return $roomId;
    }

    /**
     * Test all 8 scenarios in a single coherent flow:
     * 1. Two guests with consecutive booking dates (Guest A: 21-22 Nov, Guest B: 22-23 Nov).
     * 2. Previous guest checks out on time.
     * 3. Previous guest does not check out (overdue stay).
     * 4. Next guest arrives while previous guest is still staying -> Check-in blocked!
     * 5. Previous guest checks out -> Room moves to Cleaning -> Check-in blocked!
     * 6. Reception marks room Ready -> Room moves to 'ok'.
     * 7. Next guest checks in -> Check-in succeeds! Room has exactly ONE staying guest.
     * 8. Two receptionists attempt to check in different guests to the same room -> One succeeds, one blocked.
     */
    public function testConsecutiveBookingsAndSingleRoomOccupancyFullFlow(): void
    {
        $roomId = $this->findOrCreateCleanRoom();

        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        // 1. Two guests with consecutive booking dates:
        // Guest A: Today to Tomorrow
        // Guest B: Tomorrow to Day After Tomorrow
        $resA = $this->reservationService->create(
            1, $roomId, '9800000001', 'Guest A', $today, $tomorrow,
            1, 2200.0, 500.0, 'cash', 1
        );
        $resB = $this->reservationService->create(
            1, $roomId, '9800000002', 'Guest B', $tomorrow, $dayAfter,
            1, 2200.0, 500.0, 'cash', 1
        );

        $this->assertNotEmpty($resA['booking_code']);
        $this->assertNotEmpty($resB['booking_code']);
        $this->assertSame('pending', $resA['status']);
        $this->assertSame('pending', $resB['status']);

        // Check in Guest A
        $stayA = $this->stayService->checkInFromReservation((int) $resA['id'], 1, 1);
        $this->assertSame('in_house', $stayA['status']);

        // Verify Reservation A is checked_in, Reservation B is pending
        $refreshedA = $this->reservationRepo->find((int) $resA['id']);
        $refreshedB = $this->reservationRepo->find((int) $resB['id']);
        $this->assertSame('checked_in', $refreshedA['status']);
        $this->assertSame('pending', $refreshedB['status']);

        // 3 & 4. Previous guest has not checked out (overdue or staying).
        // Next guest (Guest B) arrives while Guest A is still staying:
        // Attempt to check in Guest B must fail!
        try {
            $this->stayService->checkInFromReservation((int) $resB['id'], 1, 1);
            $this->fail('Guest B check-in should be rejected while Guest A is still staying.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('already occupied by another active stay', $e->getMessage());
        }

        // Also test direct walk-in check-in to this room is blocked
        try {
            $this->stayService->directCheckIn(
                1, $roomId, '9800000099', 'Walk-in Guest', 'Aadhaar', '999988887777',
                'Salem', 1, 1, 2200.0, 1000.0, 'cash', 1
            );
            $this->fail('Direct walk-in check-in should be rejected while room is occupied.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('already occupied by another active stay', $e->getMessage());
        }

        // 5. Previous guest (Guest A) completes checkout:
        // Room status automatically moves to 'cleaning'
        $checkoutResult = $this->stayService->checkout((int) $stayA['id'], 1, 'cash', null, 1);
        $this->assertSame('checked_out', $checkoutResult['stay']['status']);

        // Verify Reservation A is now marked 'checked_out'
        $refreshedA2 = $this->reservationRepo->find((int) $resA['id']);
        $this->assertSame('checked_out', $refreshedA2['status']);

        // Verify Room is now in 'cleaning' status
        $roomAfterCheckout = $this->roomRepo->find($roomId);
        $this->assertSame('cleaning', $roomAfterCheckout['housekeeping_status']);

        // While room is in 'cleaning', next guest (Guest B) CANNOT check in!
        try {
            $this->stayService->checkInFromReservation((int) $resB['id'], 1, 1);
            $this->fail('Guest B check-in should be rejected while room is in cleaning status.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertStringContainsString('cleaning in progress', $e->getMessage());
        }

        // 6. Reception marks room Ready:
        $this->roomService->setHousekeeping($roomId, 'ready', null, 1, 1);
        $roomAfterReady = $this->roomRepo->find($roomId);
        $this->assertSame('ok', $roomAfterReady['housekeeping_status']);

        // 7. Next guest (Guest B) checks in:
        $stayB = $this->stayService->checkInFromReservation((int) $resB['id'], 1, 1);
        $this->assertSame('in_house', $stayB['status']);

        // Verify only ONE guest is staying now (Guest B)
        $refreshedB2 = $this->reservationRepo->find((int) $resB['id']);
        $this->assertSame('checked_in', $refreshedB2['status']);

        $activeStays = $this->db->query("SELECT * FROM stays WHERE room_id = {$roomId} AND status = 'in_house'")->fetchAll();
        $this->assertCount(1, $activeStays);
        $this->assertSame((int) $stayB['id'], (int) $activeStays[0]['id']);

        $checkedInReservations = $this->db->query("SELECT * FROM reservations WHERE room_id = {$roomId} AND status = 'checked_in'")->fetchAll();
        $this->assertCount(1, $checkedInReservations);
        $this->assertSame((int) $resB['id'], (int) $checkedInReservations[0]['id']);

        // 8. Two receptionists attempt to check in different guests to the same room:
        // Try to perform a concurrent direct check-in while Guest B is staying:
        try {
            $this->stayService->directCheckIn(
                1, $roomId, '9800000088', 'Simultaneous Guest', 'Aadhaar', '888877776666',
                'Trichy', 1, 1, 2200.0, 1000.0, 'cash', 1
            );
            $this->fail('Simultaneous check-in should be blocked.');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertStringContainsString('already occupied', $e->getMessage());
        }
    }
}
