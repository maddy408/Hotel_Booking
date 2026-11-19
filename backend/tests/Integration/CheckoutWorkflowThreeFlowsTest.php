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
use PHPUnit\Framework\TestCase;

final class CheckoutWorkflowThreeFlowsTest extends TestCase
{
    private const HOTEL_ID = 997;

    private PDO $db;
    private StayRepository $stayRepo;
    private PaymentRepository $paymentRepo;
    private RoomRepository $roomRepo;
    private ReservationRepository $reservationRepo;
    private SettingsRepository $settingsRepo;
    private AvailabilityService $availability;
    private BillingService $billing;
    private InvoiceService $invoiceService;
    private StayService $stayService;
    private ReservationService $reservationService;

    private int $room101Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // 1. Hotel & Settings
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Pondy Test Resort', 'Pondicherry')");
        $this->db->exec(
            "INSERT INTO settings (
                hotel_id, invoice_prefix, checkout_hour, timezone,
                cancellation_deadline_hours, cancellation_free_allowed,
                cancellation_fee_type, cancellation_fee_value,
                cancellation_late_fee_type, cancellation_late_fee_value,
                early_checkout_refund_unused_nights, early_checkout_fee_type, early_checkout_fee_value
            ) VALUES (
                " . self::HOTEL_ID . ", 'INV-CHK', 12, 'Asia/Kolkata',
                24, 1, 'none', 0.00, 'none', 0.00,
                1, 'none', 0.00
            )"
        );

        // 2. Room types & Rooms
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9971, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2000.00, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99701, " . self::HOTEL_ID . ", 201, 2, 9971, 'ok')");
        $this->room101Id = 99701;

        // 3. Guest
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (99799, " . self::HOTEL_ID . ", 'Ravi Shankar', '9840112233', 'Aadhaar', '5678')");
        $this->guestId = 99799;

        // Repositories & Services
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $uploader = new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads');
        $guestService = new GuestService(new GuestRepository($this->db), $uploader, $audit);
        $this->availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $this->billing = new BillingService(new GstService($this->settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo, $this->settingsRepo);
        $this->invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $this->roomRepo, $guestService,
            $this->availability, $this->paymentRepo, $this->settingsRepo, $audit, $this->stayRepo
        );

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $this->roomRepo,
            new StayChargeRepository($this->db), $this->paymentRepo,
            new HousekeepingLogRepository($this->db), $this->settingsRepo,
            $guestService, $this->availability, $this->billing, $this->invoiceService, $audit
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $hid = self::HOTEL_ID;
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (SELECT id FROM rooms WHERE hotel_id = {$hid})");
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM payments WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM stay_charges WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = {$hid})");
        $this->db->exec("DELETE FROM occupants WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM stays WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM guests WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM settings WHERE hotel_id = {$hid}");
        $this->db->exec("DELETE FROM hotels WHERE id = {$hid}");
    }

    /**
     * Flow 1: Normal Checkout Flow
     * Actual checkout date equals planned checkout date.
     */
    public function testFlow1_NormalCheckout(): void
    {
        $checkIn = '2026-11-09';
        $plannedOut = '2026-11-10';
        $actualOut = '2026-11-10'; // Equals planned checkout date

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Advance paid: 1 night = 2000 + 5% GST = 2100
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 2100.00, 'upi', 1);

        // 1. Preview
        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertTrue($preview['isNormalCheckout']);
        $this->assertFalse($preview['isEarlyCheckout']);
        $this->assertFalse($preview['isLateCheckout']);
        $this->assertSame('normal', $preview['checkoutType']);
        $this->assertSame(1, $preview['actualNightsStayed']);
        $this->assertSame(1, $preview['plannedNights']);
        $this->assertSame(0, $preview['unusedNights']);
        $this->assertSame(0, $preview['additionalNights']);
        $this->assertEquals(2000.00, $preview['actualRoomCharges']);
        $this->assertEquals(100.00, $preview['taxes']);
        $this->assertEquals(2100.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(0.00, $preview['outstandingBalance']);

        // 2. Checkout
        $result = $this->stayService->checkout(
            $stayId, self::HOTEL_ID, 'upi', null, 1, 0.0, $actualOut, expectedCheckoutType: 'normal'
        );

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertSame($actualOut, $result['stay']['checkout_actual']);
        $this->assertEquals(2100.00, (float) $result['invoice']['total_amount']);
        $this->assertEquals(0.00, (float) $result['invoice']['balance_amount']);
        $this->assertEquals(0.00, (float) $result['invoice']['refund_amount']);

        // Room status goes to cleaning
        $room = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $room['housekeeping_status']);
    }

    /**
     * Flow 2: Early Checkout Flow
     * Actual checkout date is before planned checkout date.
     */
    public function testFlow2_EarlyCheckout(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05'; // 4 nights planned
        $actualOut = '2026-11-03';  // 2 nights stayed

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Advance paid for 4 nights: 4 * 2000 * 1.05 = 8400
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 8400.00, 'upi', 1);

        // 1. Preview
        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertTrue($preview['isEarlyCheckout']);
        $this->assertFalse($preview['isNormalCheckout']);
        $this->assertFalse($preview['isLateCheckout']);
        $this->assertSame('early', $preview['checkoutType']);
        $this->assertSame(2, $preview['actualNightsStayed']);
        $this->assertSame(4, $preview['plannedNights']);
        $this->assertSame(2, $preview['unusedNights']);
        $this->assertSame(0, $preview['additionalNights']);
        $this->assertEquals(4000.00, $preview['actualRoomCharges']);
        $this->assertEquals(200.00, $preview['taxes']);
        $this->assertEquals(4200.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(4200.00, $preview['eligibleRefundAmount']); // 8400 - 4200 = 4200 refund

        // 2. Checkout
        $result = $this->stayService->checkout(
            $stayId, self::HOTEL_ID, 'upi', null, 1, null, $actualOut, expectedCheckoutType: 'early'
        );

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertSame($actualOut, $result['stay']['checkout_actual']);
        $this->assertEquals(4200.00, (float) $result['invoice']['total_amount']);
        $this->assertEquals(4200.00, (float) $result['invoice']['refund_amount']);
        $this->assertEquals(0.00, (float) $result['invoice']['balance_amount']);

        // Room goes to cleaning
        $room = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $room['housekeeping_status']);
    }

    /**
     * Flow 3: Late Checkout Flow (Extended Stay)
     * Actual checkout date is after planned checkout date.
     * The exact user-reported scenario!
     */
    public function testFlow3_LateCheckoutExtendedStay(): void
    {
        // Example:
        // Original Check-in: 09-Nov-2026
        // Original Planned Checkout: 10-Nov-2026
        // Selected Actual Checkout: 17-Nov-2026
        // Actual Nights Stayed: 8 nights
        $checkIn = '2026-11-09';
        $plannedOut = '2026-11-10'; // 1 night planned
        $actualOut = '2026-11-17';  // 8 nights actual

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Paid for 1 night advance: 2100
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 2100.00, 'cash', 1);

        // 1. Preview
        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertTrue($preview['isLateCheckout']);
        $this->assertFalse($preview['isEarlyCheckout']);
        $this->assertFalse($preview['isNormalCheckout']);
        $this->assertSame('late', $preview['checkoutType']);
        $this->assertSame(8, $preview['actualNightsStayed']);
        $this->assertSame(1, $preview['plannedNights']);
        $this->assertSame(0, $preview['unusedNights']);
        $this->assertSame(7, $preview['additionalNights']);

        // Charges: 8 nights * 2000 = 16000 + 800 GST = 16800
        $this->assertEquals(16000.00, $preview['actualRoomCharges']);
        $this->assertEquals(800.00, $preview['taxes']);
        $this->assertEquals(16800.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(0.00, $preview['earlyCheckoutFee']);
        // Outstanding: 16800 - 2100 = 14700
        $this->assertEquals(14700.00, $preview['outstandingBalance']);

        // 2. Checkout: guest pays outstanding 14700
        $result = $this->stayService->checkout(
            $stayId, self::HOTEL_ID, 'card', null, 1, 14700.00, $actualOut, expectedCheckoutType: 'late'
        );

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertSame($actualOut, $result['stay']['checkout_actual']);
        $this->assertEquals(16800.00, (float) $result['invoice']['total_amount']);
        $this->assertEquals(0.00, (float) $result['invoice']['balance_amount']);
        $this->assertEquals(0.00, (float) $result['invoice']['refund_amount']);

        $room = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $room['housekeeping_status']);
    }

    /**
     * Flow 4: Backend Independent Type Validation
     */
    public function testBackendValidatesCheckoutTypeMismatch(): void
    {
        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, '2026-11-09', '2026-11-10', 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 2100.00, 'cash', 1);

        // Attempting to claim 'early' when actual checkout date is 2026-11-17 (> 2026-11-10) must fail
        try {
            $this->stayService->checkout(
                $stayId, self::HOTEL_ID, 'cash', null, 1, 14700.00, '2026-11-17', expectedCheckoutType: 'early'
            );
            $this->fail('Expected validation exception when claiming early checkout on a late date');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertArrayHasKey('actualCheckoutDate', (array) $e->getFields());
        }

        // Attempting to claim 'late' when actual checkout date is 2026-11-09 (< 2026-11-10) must fail
        try {
            $this->stayService->checkout(
                $stayId, self::HOTEL_ID, 'cash', null, 1, 0.0, '2026-11-09', expectedCheckoutType: 'late'
            );
            $this->fail('Expected validation exception when claiming late checkout on an early date');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertArrayHasKey('actualCheckoutDate', (array) $e->getFields());
        }

        // Attempting to checkout before check-in date must fail
        try {
            $this->stayService->checkout(
                $stayId, self::HOTEL_ID, 'cash', null, 1, 0.0, '2026-11-08'
            );
            $this->fail('Expected validation exception when checkout date is before check-in date');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertArrayHasKey('actualCheckoutDate', (array) $e->getFields());
        }
    }
}
