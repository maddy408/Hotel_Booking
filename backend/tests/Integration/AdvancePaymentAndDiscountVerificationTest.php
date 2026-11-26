<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReportRepository;
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
use App\Service\OccupantDocumentService;
use App\Service\ReportService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * End-to-end integration tests for:
 * 1. Advance equal to total payable
 * 2. Advance less than total payable
 * 3. Advance greater than total payable (rejected)
 * 4. Zero advance (booking allowed, check-in requires advance)
 * 5. Negative advance (rejected)
 * 6. Booking with advance followed by check-in
 * 7. Direct check-in with advance
 * 8. Multiple payments using different payment methods
 * 9. Fixed discount
 * 10. Percentage discount
 * 11. Full discount (100%)
 * 12. Discount greater than payable (rejected)
 * 13. Bills and Reports consistency
 */
final class AdvancePaymentAndDiscountVerificationTest extends TestCase
{
    private const HOTEL_ID = 989;

    private PDO $db;
    private ReservationRepository $reservationRepo;
    private RoomRepository $roomRepo;
    private StayRepository $stayRepo;
    private PaymentRepository $paymentRepo;
    private SettingsRepository $settingsRepo;
    private GuestRepository $guestRepo;
    private GuestService $guestService;
    private AvailabilityService $availability;
    private ReservationService $reservationService;
    private StayService $stayService;
    private BillingService $billing;
    private InvoiceService $invoiceService;
    private InvoiceRepository $invoiceRepo;
    private ReportService $reportService;
    private ReportRepository $reportRepo;
    private OccupantRepository $occupantRepo;

    private int $roomId;
    private int $guestId;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Setup isolated hotel
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'KKK Lodge Test', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'KKKT', 12, 'Asia/Kolkata')");
        // Room type: Standard Room @ 2095.24 + 5% GST = 2200.00 total (or 2000 + 5% = 2100)
        // Let's set rate to 2095.24 so total with 5% GST (104.76) = 2200.00
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9891, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 2095.238, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (98901, " . self::HOTEL_ID . ", 101, 1, 9891, 'ok')");
        $this->roomId = 98901;

        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (98901, " . self::HOTEL_ID . ", 'Ramesh Kumar', '9876543210', 'Aadhaar', '1234')");
        $this->guestId = 98901;

        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo);
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $this->availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $gstService = new GstService($this->settingsRepo);
        $this->billing = new BillingService($gstService, new StayChargeRepository($this->db), $this->paymentRepo);
        $this->invoiceRepo = new InvoiceRepository($this->db);
        $this->invoiceService = new InvoiceService($this->db, $this->invoiceRepo);
        $this->reportRepo = new ReportRepository($this->db);
        $this->reportService = new ReportService($this->reportRepo, $this->invoiceRepo);

        $this->occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $uploader = new OccupantDocumentUploader(sys_get_temp_dir());
        $occupantDocService = new OccupantDocumentService($this->occupantRepo, $occupantDocRepo, $this->stayRepo, $uploader, $this->reservationRepo);

        $this->stayService = new StayService(
            $this->db, $this->stayRepo, $this->reservationRepo, $this->roomRepo,
            new StayChargeRepository($this->db), $this->paymentRepo,
            new HousekeepingLogRepository($this->db), $this->settingsRepo,
            $this->guestService, $this->availability, $this->billing, $this->invoiceService, $audit,
            null, $occupantDocService
        );

        $this->reservationService = new ReservationService(
            $this->db, $this->reservationRepo, $this->roomRepo, $this->guestService,
            $this->availability, $this->paymentRepo, $this->settingsRepo, $audit, $this->stayRepo,
            $gstService, $occupantDocService
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
        $this->db->exec("DELETE FROM occupants WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    /**
     * Scenario 1: Advance equal to total payable.
     * Total payable = 2200. Advance entered = 2200.
     * Transaction succeeds; remaining balance is 0.
     */
    public function testScenario1_AdvanceEqualToTotalPayable_AllowedAndSettled(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            $today, $tomorrow, 1, 2095.238, 2200.00, 'cash', null
        );

        $this->assertNotEmpty($res['id']);
        $this->assertEqualsWithDelta(2200.00, (float) $res['advance_paid'], 0.01);
        $this->assertEqualsWithDelta(2200.00, (float) $res['total_amount'], 0.01);

        // Check payment record
        $payments = $this->paymentRepo->forReservation((int) $res['id']);
        $this->assertCount(1, $payments);
        $this->assertEqualsWithDelta(2200.00, (float) $payments[0]['amount'], 0.01);
        $this->assertSame('advance', $payments[0]['type']);
        $this->assertSame('cash', $payments[0]['method']);
    }

    /**
     * Scenario 2: Advance less than total payable.
     * Total payable = 2200. Advance entered = 2000.
     * Remaining balance = 200.
     */
    public function testScenario2_AdvanceLessThanTotalPayable_RemainingBalanceCalculated(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            $today, $tomorrow, 1, 2095.238, 2000.00, 'upi', null
        );

        $this->assertEqualsWithDelta(2000.00, (float) $res['advance_paid'], 0.01);
        $balance = (float) $res['total_amount'] - (float) $res['advance_paid'];
        $this->assertEqualsWithDelta(200.00, $balance, 0.01);
    }

    /**
     * Scenario 3: Advance greater than total payable.
     * Total payable = 2200. Advance entered = 20000.
     * Transaction rejected with "Advance cannot exceed the total payable amount."
     * No partial records created.
     */
    public function testScenario3_AdvanceGreaterThanTotalPayable_RejectedWithExactMessage(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Advance cannot exceed the total payable amount.');

        try {
            $this->reservationService->create(
                self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
                $today, $tomorrow, 1, 2095.238, 20000.00, 'cash', null
            );
        } finally {
            // Verify no reservation or payment was left behind
            $countRes = (int) $this->db->query("SELECT COUNT(*) FROM reservations WHERE hotel_id = " . self::HOTEL_ID)->fetchColumn();
            $countPay = (int) $this->db->query("SELECT COUNT(*) FROM payments WHERE hotel_id = " . self::HOTEL_ID)->fetchColumn();
            $this->assertSame(0, $countRes);
            $this->assertSame(0, $countPay);
        }
    }

    /**
     * Scenario 4: Zero advance.
     * Booking allows 0 advance (guest can pay on arrival).
     * Direct check-in rejects 0 advance (requires advance payment).
     */
    public function testScenario4_ZeroAdvance_AllowedForBooking_RejectedForDirectCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        // Booking with 0 advance succeeds
        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            $today, $tomorrow, 1, 2095.238, 0.00, 'cash', null
        );
        $this->assertEqualsWithDelta(0.00, (float) $res['advance_paid'], 0.01);

        // Direct check-in with 0 advance is rejected
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Please enter and collect the advance amount before check-in.');

        $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            0.00, 'cash', null
        );
    }

    /**
     * Scenario 5: Negative advance.
     * Advance entered = -500.
     * Transaction rejected with validation error.
     */
    public function testScenario5_NegativeAdvance_Rejected(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $this->expectException(ApiException::class);

        $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            $today, $tomorrow, 1, 2095.238, -500.00, 'cash', null
        );
    }

    /**
     * Scenario 6: Booking with advance followed by check-in.
     * Advance: 1,000 of 2,200. Check-in carries over advance. Balance = 1,200.
     */
    public function testScenario6_BookingWithAdvanceFollowedByCheckIn_Consistency(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            $today, $tomorrow, 1, 2095.238, 1000.00, 'card', null
        );

        $stay = $this->stayService->checkInFromReservation(
            (int) $res['id'], self::HOTEL_ID, null, 1, [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        $this->assertNotEmpty($stay['id']);
        $bill = $this->stayService->bill((int) $stay['id'], self::HOTEL_ID);
        $this->assertEqualsWithDelta(1000.00, (float) $bill['advancePaid'], 0.01);
        $this->assertEqualsWithDelta(1200.00, (float) $bill['balance'], 0.01);

        // Verify only 1 payment record exists (no duplication on check-in)
        $payments = $this->db->query("SELECT * FROM payments WHERE hotel_id = " . self::HOTEL_ID)->fetchAll(PDO::FETCH_ASSOC);
        $this->assertCount(1, $payments);
        $this->assertSame('card', $payments[0]['method']);
        $this->assertSame((int) $res['id'], (int) $payments[0]['reservation_id']);
    }

    /**
     * Scenario 7: Direct check-in with advance.
     * Total = 2200. Advance = 1500. Balance = 700.
     */
    public function testScenario7_DirectCheckInWithAdvance_RecordedCorrectly(): void
    {
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            1500.00, 'upi', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        $this->assertNotEmpty($stay['id']);
        $bill = $this->stayService->bill((int) $stay['id'], self::HOTEL_ID);
        $this->assertEqualsWithDelta(1500.00, (float) $bill['advancePaid'], 0.01);
        $this->assertEqualsWithDelta(700.00, (float) $bill['balance'], 0.01);

        $payments = $this->paymentRepo->forStay((int) $stay['id']);
        $this->assertCount(1, $payments);
        $this->assertSame('upi', $payments[0]['method']);
        $this->assertEqualsWithDelta(1500.00, (float) $payments[0]['amount'], 0.01);
    }

    /**
     * Scenario 8: Multiple payments using different payment methods.
     * Advance: 1,000 Cash.
     * Checkout balance: 1,200 Card.
     * Verify both payments saved with proper methods and balance becomes 0.
     */
    public function testScenario8_MultiplePayments_DifferentPaymentMethods(): void
    {
        $today = date('Y-m-d');
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            1000.00, 'cash', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        $checkoutResult = $this->stayService->checkout(
            (int) $stay['id'], self::HOTEL_ID, 'card', null, null, 1200.00, $today
        );

        $this->assertEqualsWithDelta(2200.00, (float) $checkoutResult['bill']['total'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) $checkoutResult['bill']['balance'], 0.01);

        $payments = $this->paymentRepo->forStay((int) $stay['id']);
        $this->assertCount(2, $payments);

        $this->assertSame('cash', $payments[0]['method']);
        $this->assertSame('advance', $payments[0]['type']);
        $this->assertEqualsWithDelta(1000.00, (float) $payments[0]['amount'], 0.01);

        $this->assertSame('card', $payments[1]['method']);
        $this->assertSame('balance', $payments[1]['type']);
        $this->assertEqualsWithDelta(1200.00, (float) $payments[1]['amount'], 0.01);
    }

    /**
     * Scenario 9: Fixed discount.
     * Bill before discount = 2200. Fixed discount = 200.
     * Final payable = 2000.
     * Revenue = 2000 (does not include the 200 discount).
     */
    public function testScenario9_FixedDiscount_ReducesInvoiceAndPayable_NotRevenue(): void
    {
        $today = date('Y-m-d');
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            1000.00, 'cash', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        // Apply discount before or at checkout
        $checkoutResult = $this->stayService->checkout(
            (int) $stay['id'], self::HOTEL_ID, 'upi', null, null,
            1000.00, // balance due: 2200 - 1000 advance - 200 discount = 1000
            $today, 200.00, 'Manager discretion'
        );

        $this->assertEqualsWithDelta(2000.00, (float) $checkoutResult['bill']['total'], 0.01);
        $this->assertEqualsWithDelta(200.00, (float) $checkoutResult['bill']['discountAmount'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) $checkoutResult['bill']['balance'], 0.01);

        // Verify invoice in DB
        $invoice = $this->invoiceRepo->findByStay((int) $stay['id']);
        $this->assertEqualsWithDelta(2000.00, (float) $invoice['total_amount'], 0.01);
        $this->assertEqualsWithDelta(200.00, (float) $invoice['discount_amount'], 0.01);

        // Verify Revenue totals
        $rev = $this->reportService->revenue(self::HOTEL_ID, $today, $today);
        $this->assertEqualsWithDelta(2000.00, (float) $rev['totals']['total'], 0.01);
        $this->assertEqualsWithDelta(200.00, (float) $rev['totals']['discountAmount'], 0.01);
    }

    /**
     * Scenario 10: Percentage discount.
     * Bill before discount = 2200. 10% discount = 220.
     * Final payable = 1980.
     */
    public function testScenario10_PercentageDiscount_CalculatedCorrectly(): void
    {
        $today = date('Y-m-d');
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            500.00, 'cash', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        $billBefore = $this->stayService->bill((int) $stay['id'], self::HOTEL_ID);
        $totalBefore = (float) $billBefore['total'];
        $discountAmount = round($totalBefore * 0.10, 2); // 10% = 220.00

        $checkoutResult = $this->stayService->checkout(
            (int) $stay['id'], self::HOTEL_ID, 'card', null, null,
            1480.00, // 2200 - 500 advance - 220 discount = 1480
            $today, $discountAmount, '10% promotional discount'
        );

        $this->assertEqualsWithDelta(1980.00, (float) $checkoutResult['bill']['total'], 0.01);
        $this->assertEqualsWithDelta(220.00, (float) $checkoutResult['bill']['discountAmount'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) $checkoutResult['bill']['balance'], 0.01);
    }

    /**
     * Scenario 11: Full discount (100% discount).
     * Bill = 2200. Discount = 2200.
     * Final payable = 0. Payment collected = 0.
     * Discount recorded in invoice.
     * Discount must NOT be counted as revenue or payment collection.
     */
    public function testScenario11_FullDiscount_100Percent_ZeroPayableZeroRevenue(): void
    {
        $today = date('Y-m-d');
        // Create stay with 0 advance (complimentary stay)
        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, $this->roomId, $this->guestId,
            1, 2095.238, $today, date('Y-m-d', strtotime('+1 day')), null,
            '12:00:00', 0.05, 104.76, 'Direct', null, null
        );
        $this->occupantRepo->create(self::HOTEL_ID, $stayId, 1, 'VIP Guest', true, $this->guestId, 'Male', '9876543210');

        // Apply 100% discount (2200.00)
        $checkoutResult = $this->stayService->checkout(
            $stayId, self::HOTEL_ID, 'cash', null, null,
            0.00, $today, 2200.00, '100% complimentary VIP stay'
        );

        $this->assertEqualsWithDelta(0.00, (float) $checkoutResult['bill']['total'], 0.01);
        $this->assertEqualsWithDelta(2200.00, (float) $checkoutResult['bill']['discountAmount'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) $checkoutResult['bill']['balance'], 0.01);

        // Check invoice
        $invoice = $this->invoiceRepo->findByStay($stayId);
        $this->assertEqualsWithDelta(0.00, (float) $invoice['total_amount'], 0.01);
        $this->assertEqualsWithDelta(2200.00, (float) $invoice['discount_amount'], 0.01);

        // Check reports
        $rev = $this->reportService->revenue(self::HOTEL_ID, $today, $today);
        $this->assertEqualsWithDelta(0.00, (float) $rev['totals']['total'], 0.01);
        $this->assertEqualsWithDelta(2200.00, (float) $rev['totals']['discountAmount'], 0.01);

        $dayEnd = $this->reportService->dayEnd(self::HOTEL_ID, $today, $today);
        $this->assertEqualsWithDelta(0.00, (float) $dayEnd['total'], 0.01);
    }

    /**
     * Scenario 12: Discount greater than bill amount.
     * Bill = 2200. Discount entered = 2500.
     * Rejected with "Discount cannot exceed the payable amount."
     */
    public function testScenario12_DiscountGreaterThanPayable_RejectedWithExactMessage(): void
    {
        $today = date('Y-m-d');
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Ramesh Kumar',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            1000.00, 'cash', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Ramesh Kumar', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Discount cannot exceed the payable amount.');

        $this->stayService->applyDiscount((int) $stay['id'], self::HOTEL_ID, 2500.00, 'Over-discount', null);
    }

    /**
     * Scenario 13: Bills and Reports consistency after transactions.
     * Checks Billed, Advance, Balance, Cash/UPI/Card collections, and Revenue.
     */
    public function testScenario13_BillsAndReportsConsistencyAfterTransactions(): void
    {
        $today = date('Y-m-d');

        // Transaction 1: Direct check in with 1000 cash, checkout with 1200 card
        $stay1 = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543210', 'Guest 1',
            'Aadhaar', '1234', 'Pondicherry', 1, 1, 2095.238,
            1000.00, 'cash', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Guest 1', 'gender' => 'Male', 'phone' => '9876543210']
            ]
        );
        $this->stayService->checkout((int) $stay1['id'], self::HOTEL_ID, 'card', null, null, 1200.00, $today);

        // Mark room clean/ready for next guest check-in
        $this->db->exec("UPDATE rooms SET housekeeping_status = 'ok' WHERE id = {$this->roomId}");

        // Transaction 2: Direct check in with 500 UPI, 200 discount, checkout with 1500 cash
        $stay2 = $this->stayService->directCheckIn(
            self::HOTEL_ID, $this->roomId, '9876543211', 'Guest 2',
            'Aadhaar', '5678', 'Pondicherry', 1, 1, 2095.238,
            500.00, 'upi', null, null, 'Social Media', null, null,
            [], [], [
                ['occupant_number' => 1, 'name' => 'Guest 2', 'gender' => 'Female', 'phone' => '9876543211']
            ]
        );
        $this->stayService->checkout((int) $stay2['id'], self::HOTEL_ID, 'cash', null, null, 1500.00, $today, 200.00, 'Promo');

        // Check Reports Summary
        $summary = $this->reportService->today(self::HOTEL_ID, $today, $today);
        $this->assertSame(2, $summary['checkouts']);
        // Billed: Stay 1 (2200) + Stay 2 (2000) = 4200
        $this->assertEqualsWithDelta(4200.00, (float) $summary['billedAtCheckout'], 0.01);
        // Advance taken: 1000 + 500 = 1500
        $this->assertEqualsWithDelta(1500.00, (float) $summary['advanceTaken'], 0.01);
        // Balance collected: 1200 + 1500 = 2700
        $this->assertEqualsWithDelta(2700.00, (float) $summary['balanceCollected'], 0.01);

        // Check DayEnd Collections
        $dayEnd = $this->reportService->dayEnd(self::HOTEL_ID, $today, $today);
        $this->assertEqualsWithDelta(2500.00, (float) $dayEnd['byMethod']['cash'], 0.01); // 1000 adv + 1500 bal
        $this->assertEqualsWithDelta(500.00, (float) $dayEnd['byMethod']['upi'], 0.01);    // 500 adv
        $this->assertEqualsWithDelta(1200.00, (float) $dayEnd['byMethod']['card'], 0.01);  // 1200 bal
        $this->assertEqualsWithDelta(4200.00, (float) $dayEnd['total'], 0.01);

        // Check Revenue
        $rev = $this->reportService->revenue(self::HOTEL_ID, $today, $today);
        $this->assertSame(2, $rev['totals']['invoiceCount']);
        $this->assertEqualsWithDelta(4200.00, (float) $rev['totals']['total'], 0.01);
        $this->assertEqualsWithDelta(200.00, (float) $rev['totals']['discountAmount'], 0.01);
    }
}
