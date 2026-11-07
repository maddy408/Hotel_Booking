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
use App\Support\IdImageUploader;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Complete integration test suite verifying the 20 financial workflow scenarios for:
 * - Booking cancellation before check-in
 * - Early checkout after check-in
 * - Advance payment adjustments
 * - Partial and full refunds
 * - Final invoice recalculation & room status integration
 */
final class CancellationRefundEarlyCheckoutTest extends TestCase
{
    private const HOTEL_ID = 996;
    private PDO $db;
    private ReservationRepository $reservationRepo;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private PaymentRepository $paymentRepo;
    private SettingsRepository $settingsRepo;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private AvailabilityService $availability;
    private BillingService $billing;
    private InvoiceService $invoiceService;
    private ReservationService $reservationService;
    private StayService $stayService;
    private RoomService $roomService;

    private int $room101Id;
    private int $room102Id;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // 1. Hotel & Settings
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Grand Palace Pondy', 'Pondicherry')");
        $this->db->exec(
            "INSERT INTO settings (
                hotel_id, invoice_prefix, checkout_hour, timezone,
                cancellation_deadline_hours, cancellation_free_allowed,
                cancellation_fee_type, cancellation_fee_value,
                cancellation_late_fee_type, cancellation_late_fee_value,
                early_checkout_refund_unused_nights, early_checkout_fee_type, early_checkout_fee_value
            ) VALUES (
                " . self::HOTEL_ID . ", 'INV-TEST', 12, 'Asia/Kolkata',
                24, 1, 'fixed', 500.00, 'percentage', 10.00,
                1, 'none', 0.00
            )"
        );

        // 2. Room types & Rooms
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9961, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2000.00, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99601, " . self::HOTEL_ID . ", 101, 1, 9961, 'ok')");
        $this->room101Id = 99601;
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99602, " . self::HOTEL_ID . ", 102, 1, 9961, 'ok')");
        $this->room102Id = 99602;

        // 3. Guest
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (99699, " . self::HOTEL_ID . ", 'Anand Kumar', '9876543210', 'Aadhaar', '1234')");
        $this->guestId = 99699;

        // Repositories & Services
        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'));
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $this->billing = new BillingService(new GstService($this->settingsRepo), new StayChargeRepository($this->db), $this->paymentRepo, $this->settingsRepo);
        $this->invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $this->roomRepo, $this->guestService,
            $this->availability, $this->paymentRepo, $this->settingsRepo, $audit, $this->stayRepo
        );

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $this->roomRepo,
            new StayChargeRepository($this->db), $this->paymentRepo,
            new HousekeepingLogRepository($this->db), $this->settingsRepo,
            $this->guestService, $this->availability, $this->billing, $this->invoiceService, $audit
        );

        $this->roomService = new RoomService(
            $this->roomRepo, new RoomTypeRepository($this->db),
            new HousekeepingLogRepository($this->db), $audit
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id IN (99601, 99602)");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /** Scenario 1: Cancel before check-in with full advance. */
    public function testScenario1_CancelBeforeCheckinWithFullAdvance(): void
    {
        $futureIn = date('Y-m-d', strtotime('+10 days'));
        $futureOut = date('Y-m-d', strtotime('+14 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 8000.00, 'upi', 1
        );

        $preview = $this->reservationService->cancellationPreview((int) $res['id'], self::HOTEL_ID);
        $this->assertEquals(8000.00, $preview['totalSuccessfulPaid']);
        $this->assertTrue($preview['isBeforeDeadline']);
        $this->assertEquals(0.00, $preview['cancellationFee']); // Free cancellation before deadline
        $this->assertEquals(8000.00, $preview['refundableAmount']);

        $cancelled = $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Travel plans changed', 0.0, 'upi', 1);
        $this->assertSame('cancelled', $cancelled['status']);
        $this->assertEquals(8000.00, (float) $cancelled['refundable_amount']);
        $this->assertEquals(0.00, (float) $cancelled['cancellation_fee']);

        // Room is free on those dates
        $this->assertTrue($this->availability->isFree($this->room101Id, $futureIn, $futureOut));
    }

    /** Scenario 2: Cancel before check-in with partial advance and configured fee. */
    public function testScenario2_CancelBeforeCheckinWithPartialAdvance(): void
    {
        // Set fixed fee of 500 when cancelled
        $this->settingsRepo->update(self::HOTEL_ID, [
            'cancellation_free_allowed' => 0,
            'cancellation_fee_type' => 'fixed',
            'cancellation_fee_value' => 500.00,
        ]);

        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+9 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 2000.00, 'cash', 1
        );

        $preview = $this->reservationService->cancellationPreview((int) $res['id'], self::HOTEL_ID);
        $this->assertEquals(2000.00, $preview['totalSuccessfulPaid']);
        $this->assertEquals(500.00, $preview['cancellationFee']);
        $this->assertEquals(1500.00, $preview['refundableAmount']);

        $cancelled = $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Family emergency', 0.0, 'cash', 1);
        $this->assertSame('cancelled', $cancelled['status']);
        $this->assertEquals(500.00, (float) $cancelled['cancellation_fee']);
        $this->assertEquals(1500.00, (float) $cancelled['refundable_amount']);
    }

    /** Scenario 3: Cancel without any successful payment. */
    public function testScenario3_CancelWithoutAnySuccessfulPayment(): void
    {
        $futureIn = date('Y-m-d', strtotime('+3 days'));
        $futureOut = date('Y-m-d', strtotime('+5 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 0.00, 'cash', 1
        );

        $preview = $this->reservationService->cancellationPreview((int) $res['id'], self::HOTEL_ID);
        $this->assertEquals(0.00, $preview['eligiblePaid']);
        $this->assertEquals(0.00, $preview['cancellationFee']);
        $this->assertEquals(0.00, $preview['refundableAmount']);

        $cancelled = $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Guest cancelled call', 0.0, 'cash', 1);
        $this->assertSame('cancelled', $cancelled['status']);
        $this->assertEquals(0.00, (float) $cancelled['refundable_amount']);
    }

    /** Scenario 4: Cancel with a pending payment. */
    public function testScenario4_CancelWithPendingPayment(): void
    {
        $futureIn = date('Y-m-d', strtotime('+4 days'));
        $futureOut = date('Y-m-d', strtotime('+6 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 0.00, 'cash', 1
        );

        // Record a pending gateway transaction of 2000
        $this->paymentRepo->record(
            self::HOTEL_ID, (int) $res['id'], null, 'advance', 2000.00, 'upi', 1,
            'Gateway order in progress', 'pending'
        );

        $preview = $this->reservationService->cancellationPreview((int) $res['id'], self::HOTEL_ID);
        $this->assertEquals(0.00, $preview['eligiblePaid']);
        $this->assertCount(1, $preview['pendingPayments']);
        $this->assertEquals(0.00, $preview['refundableAmount']);

        $cancelled = $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Payment not cleared', 0.0, 'cash', 1);
        $this->assertSame('cancelled', $cancelled['status']);
        $this->assertEquals(0.00, (float) $cancelled['refundable_amount']);
    }

    /** Scenario 5: Full cancellation refund. */
    public function testScenario5_FullCancellationRefund(): void
    {
        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+7 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 2000.00, 'upi', 1
        );
        $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Cancelled', 0.0, 'upi', 1, 500.00);

        // Eligible refundable: 1500. Process full refund of 1500
        $refundSummary = $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 1500.00, 'upi', 'Full cancellation refund', null, 1
        );

        $this->assertEquals(1500.00, $refundSummary['totalRefunded']);
        $this->assertEquals(0.00, $refundSummary['finalEligibleRefund']);
        $this->assertCount(1, $refundSummary['refundHistory']);
        $this->assertSame('successful', $refundSummary['refundHistory'][0]['status']);
    }

    /** Scenario 6: Partial cancellation refund and multiple partial refunds. */
    public function testScenario6_PartialCancellationRefund(): void
    {
        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+7 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 2000.00, 'cash', 1
        );
        $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Cancelled', 0.0, 'cash', 1, 0.0);

        // Refundable is 2000. First partial refund of 800
        $summary1 = $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 800.00, 'cash', 'Partial refund 1', null, 1
        );
        $this->assertEquals(800.00, $summary1['totalRefunded']);
        $this->assertEquals(1200.00, $summary1['finalEligibleRefund']);

        // Second partial refund of 700
        $summary2 = $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 700.00, 'cash', 'Partial refund 2', null, 1
        );
        $this->assertEquals(1500.00, $summary2['totalRefunded']);
        $this->assertEquals(500.00, $summary2['finalEligibleRefund']);
    }

    /** Scenario 7: Failed refund does not deduct eligible balance. */
    public function testScenario7_FailedRefund(): void
    {
        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+7 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 1000.00, 'upi', 1
        );
        $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Cancelled', 0.0, 'upi', 1, 0.0);

        // Record a failed refund
        $summary = $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 1000.00, 'upi', 'Bank network timeout', null, 1, 'failed'
        );

        $this->assertEquals(0.00, $summary['totalRefunded']); // Failed refund is not counted as completed
        $this->assertEquals(1000.00, $summary['finalEligibleRefund']); // Full amount still eligible

        // Now retry with successful refund
        $retrySummary = $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 1000.00, 'cash', 'Manual cash refund after bank failure', null, 1, 'successful'
        );
        $this->assertEquals(1000.00, $retrySummary['totalRefunded']);
        $this->assertEquals(0.00, $retrySummary['finalEligibleRefund']);
    }

    /** Scenario 8: Duplicate refund attempt is rejected. */
    public function testScenario8_DuplicateRefundAttempt(): void
    {
        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+7 days'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 1500.00, 'upi', 1
        );
        $this->reservationService->cancel((int) $res['id'], self::HOTEL_ID, 'Cancelled', 0.0, 'upi', 1, 0.0);

        $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 1500.00, 'upi', 'Full refund', null, 1
        );

        // Attempting another refund must be blocked
        $this->expectException(ApiException::class);
        $this->reservationService->processRefund(
            (int) $res['id'], self::HOTEL_ID, 500.00, 'upi', 'Duplicate refund attempt', null, 1
        );
    }

    /** Scenario 9: Early checkout after one night. */
    public function testScenario9_EarlyCheckoutAfterOneNight(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05'; // 4 nights planned
        $actualOut = '2026-11-02';  // Checked out after 1 night

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Advance paid for 4 nights: 4 * 2000 = 8000 + 5% GST = 8400
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 8400.00, 'upi', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(1, $preview['actualNightsStayed']);
        $this->assertEquals(4, $preview['plannedNights']);
        $this->assertEquals(2000.00, $preview['actualRoomCharges']);
        $this->assertEquals(100.00, $preview['taxes']); // 5% GST on 2000
        $this->assertEquals(2100.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(8400.00, $preview['totalNetPayments']);
        $this->assertEquals(6300.00, $preview['eligibleRefundAmount']);

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'upi', null, 1, null, $actualOut);
        $this->assertSame('checked_out', $res['stay']['status']);
        $this->assertEquals($actualOut, $res['stay']['checkout_actual']);
        $this->assertEquals(2100.00, (float) $res['invoice']['total_amount']);
        $this->assertEquals(6300.00, (float) $res['invoice']['refund_amount']);
    }

    /** Scenario 10: Early checkout after multiple nights. */
    public function testScenario10_EarlyCheckoutAfterMultipleNights(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-06'; // 5 nights
        $actualOut = '2026-11-04';  // 3 nights

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Paid 6000
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 6000.00, 'card', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(3, $preview['actualNightsStayed']);
        $this->assertEquals(6000.00, $preview['actualRoomCharges']);
        $this->assertEquals(300.00, $preview['taxes']); // 5% GST on 6000
        $this->assertEquals(6300.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(300.00, $preview['outstandingBalance']); // Owed 300
    }

    /** Scenario 11: Early checkout with full advance. */
    public function testScenario11_EarlyCheckoutWithFullAdvance(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05'; // 4 nights
        $actualOut = '2026-11-03';  // 2 nights

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Full advance: 8400
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 8400.00, 'upi', 1);

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'upi', null, 1, null, $actualOut);
        // 2 nights = 4000 + 200 GST = 4200. Refund = 4200
        $this->assertEquals(4200.00, (float) $res['invoice']['total_amount']);
        $this->assertEquals(4200.00, (float) $res['invoice']['refund_amount']);
        $this->assertEquals(0.00, (float) $res['invoice']['balance_amount']);
    }

    /** Scenario 12: Early checkout with partial advance. */
    public function testScenario12_EarlyCheckoutWithPartialAdvance(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: bill = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Partial advance 2000 paid
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 2000.00, 'cash', 1);

        // Guest owes 4200 - 2000 = 2200
        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 2200.00, $actualOut);
        $this->assertEquals(4200.00, (float) $res['invoice']['total_amount']);
        $this->assertSame('checked_out', $res['stay']['status']);
    }

    /** Scenario 13: Early checkout with additional payments. */
    public function testScenario13_EarlyCheckoutWithAdditionalPayments(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-02'; // 1 night: bill = 2100

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        // Advance 2000 + additional payment 1000 = 3000
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 2000.00, 'cash', 1);
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'balance', 1000.00, 'upi', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(2000.00, $preview['advanceSuccessfullyPaid']);
        $this->assertEquals(1000.00, $preview['otherSuccessfulPayments']);
        $this->assertEquals(3000.00, $preview['totalSuccessfulPayments']);
        $this->assertEquals(900.00, $preview['eligibleRefundAmount']); // 3000 - 2100 = 900
    }

    /** Scenario 14: Early checkout where guest owes more money. */
    public function testScenario14_EarlyCheckoutWhereGuestOwesMoreMoney(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: bill = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 1000.00, 'cash', 1);

        // Submitting incorrect payment amount must fail
        $this->expectException(ApiException::class);
        $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 1500.00, $actualOut);
    }

    /** Scenario 15: Early checkout where guest is eligible for refund. */
    public function testScenario15_EarlyCheckoutWhereGuestIsEligibleForRefund(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: bill = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 6000.00, 'upi', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(1800.00, $preview['eligibleRefundAmount']); // 6000 - 4200 = 1800

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'upi', null, 1, null, $actualOut);
        $this->assertEquals(1800.00, (float) $res['invoice']['refund_amount']);
    }

    /** Scenario 16: Early checkout where no refund or balance is due. */
    public function testScenario16_EarlyCheckoutWhereNoRefundOrBalanceIsDue(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: bill = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 4200.00, 'card', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(0.00, $preview['outstandingBalance']);
        $this->assertEquals(0.00, $preview['eligibleRefundAmount']);

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'card', null, 1, 0.0, $actualOut);
        $this->assertEquals(0.00, (float) $res['invoice']['balance_amount']);
        $this->assertEquals(0.00, (float) $res['invoice']['refund_amount']);
    }

    /** Scenario 17: Early checkout with additional charges. */
    public function testScenario17_EarlyCheckoutWithAdditionalCharges(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: room 4000 + GST 200 = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 4200.00, 'cash', 1);

        // Add 500 extra charge for Laundry
        $this->stayService->addExtra($stayId, self::HOTEL_ID, 'Laundry', 500.00, false, 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(500.00, $preview['additionalCharges']);
        $this->assertEquals(4700.00, $preview['totalInvoiceAmount']);
        $this->assertEquals(500.00, $preview['outstandingBalance']);

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 500.00, $actualOut);
        $this->assertEquals(4700.00, (float) $res['invoice']['total_amount']);
    }

    /** Scenario 18: Early checkout with discounts and taxes. */
    public function testScenario18_EarlyCheckoutWithDiscountsAndTaxes(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-05';
        $actualOut = '2026-11-03'; // 2 nights: room 4000 + GST 200 = 4200

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 4200.00, 'cash', 1);

        // Apply 500 promotional discount
        $this->stayService->applyDiscount($stayId, self::HOTEL_ID, 500.00, 'Manager special discount', 1);

        $preview = $this->stayService->earlyCheckoutPreview($stayId, self::HOTEL_ID, $actualOut);
        $this->assertEquals(500.00, $preview['discounts']);
        $this->assertEquals(3700.00, $preview['totalInvoiceAmount']); // 4200 - 500 = 3700
        $this->assertEquals(500.00, $preview['eligibleRefundAmount']); // 4200 paid - 3700 total = 500 refund

        $res = $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, null, $actualOut, 500.00, 'Manager special discount');
        $this->assertEquals(3700.00, (float) $res['invoice']['total_amount']);
        $this->assertEquals(500.00, (float) $res['invoice']['discount_amount']);
        $this->assertEquals(500.00, (float) $res['invoice']['refund_amount']);
    }

    /** Scenario 19: Attempt checkout twice is prevented. */
    public function testScenario19_AttemptCheckoutTwice(): void
    {
        $checkIn = '2026-11-01';
        $plannedOut = '2026-11-03';
        $actualOut = '2026-11-03';

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->room101Id, $this->guestId, 2, 2000.00, $checkIn, $plannedOut, 1
        );
        $this->paymentRepo->record(self::HOTEL_ID, null, $stayId, 'advance', 4200.00, 'cash', 1);

        // First checkout succeeds
        $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 0.0, $actualOut);

        // Second checkout must fail with conflict exception
        $this->expectException(ApiException::class);
        $this->stayService->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 0.0, $actualOut);
    }

    /** Scenario 20: Verify room cleaning and future booking availability. */
    public function testScenario20_VerifyRoomCleaningAndFutureBookingAvailability(): void
    {
        $today = date('Y-m-d');
        $futureIn = $today;
        $futureOut = date('Y-m-d', strtotime('+4 days'));
        $earlyOut = date('Y-m-d', strtotime('+2 days'));

        // 1. Create booking and check in
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $futureIn, $futureOut, 2, 2000.00, 4200.00, 'cash', 1
        );
        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, 1);

        // 2. Early checkout
        $this->stayService->checkout((int) $stay['id'], self::HOTEL_ID, 'cash', null, 1, 0.0, $earlyOut);

        // Room must now be 'cleaning'
        $room = $this->roomRepo->find($this->room101Id);
        $this->assertSame('cleaning', $room['housekeeping_status']);

        // Housekeeping marks room ready
        $this->roomService->setHousekeeping($this->room101Id, 'ready', null, 1, self::HOTEL_ID);
        $roomAfter = $this->roomRepo->find($this->room101Id);
        $this->assertSame('ok', $roomAfter['housekeeping_status']);

        // Future dates ($earlyOut to $futureOut) must now be free for new bookings
        $this->assertTrue($this->availability->isFree($this->room101Id, $earlyOut, $futureOut));

        // Create new booking for those freed dates
        $newRes = $this->reservationService->create(
            self::HOTEL_ID, $this->room101Id, '9876543210', 'Anand Kumar',
            $earlyOut, $futureOut, 2, 2000.00, 0.00, 'cash', 1
        );
        $this->assertSame('pending', $newRes['status']);
    }
}
