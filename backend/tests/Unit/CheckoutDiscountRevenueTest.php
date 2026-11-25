<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReportRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\ReportService;
use PDO;
use PHPUnit\Framework\TestCase;

final class CheckoutDiscountRevenueTest extends TestCase
{
    private PDO $db;
    private ReportRepository $reportRepo;

    protected function setUp(): void
    {
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $this->db->exec('
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY,
                hotel_id INTEGER,
                stay_id INTEGER,
                invoice_number TEXT,
                financial_year TEXT,
                total_amount REAL,
                room_amount REAL,
                room_gst_amount REAL,
                extras_amount REAL,
                extras_gst_amount REAL,
                discount_amount REAL,
                advance_paid REAL,
                balance_amount REAL,
                created_at TEXT
            );
        ');

        $this->reportRepo = new ReportRepository($this->db);
    }

    public function testBillingServiceWithZeroPartialAndFullDiscount(): void
    {
        $settingsMock = $this->createMock(SettingsRepository::class);
        $settingsMock->method('find')->willReturn([
            'gst_slab1_rate' => 0.05,
            'gst_slab2_rate' => 0.18,
            'gst_slab1_threshold' => 7500.0,
            'early_checkout_refund_unused_nights' => 1,
            'early_checkout_fee_type' => 'none',
            'early_checkout_fee_value' => 0.0,
        ]);

        $gstService = new GstService($settingsMock);

        $chargesMock = $this->createMock(StayChargeRepository::class);
        $chargesMock->method('forStay')->willReturn([]);

        $paymentsMock = $this->createMock(PaymentRepository::class);
        $paymentsMock->method('advancePaidForStay')->willReturn(0.0);
        $paymentsMock->method('otherSuccessfulPaymentsForStay')->willReturn(0.0);
        $paymentsMock->method('totalSuccessfulPaidForStay')->willReturn(0.0);
        $paymentsMock->method('totalRefundedForStay')->willReturn(0.0);
        $paymentsMock->method('netSettledForStay')->willReturn(0.0);

        $billing = new BillingService($gstService, $chargesMock, $paymentsMock, $settingsMock);

        $stay = [
            'id' => 10,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-20',
            'checkout_planned' => '2026-11-21',
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        // 1. Zero discount: room 2000, gst 100, total 2100, balance 2100
        $billZero = $billing->computeBill($stay, '2026-11-21', 0.0, 0.0);
        $this->assertEquals(2100.00, $billZero['total']);
        $this->assertEquals(2100.00, $billZero['balance']);
        $this->assertEquals(2100.00, $billZero['outstandingBalance']);

        // 2. Partial discount of 500: total 2100 - 500 = 1600
        $billPartial = $billing->computeBill($stay, '2026-11-21', 0.0, 500.0);
        $this->assertEquals(1600.00, $billPartial['total']);
        $this->assertEquals(1600.00, $billPartial['balance']);
        $this->assertEquals(1600.00, $billPartial['outstandingBalance']);

        // 3. 100% full discount (2100): total 0, balance 0, outstanding 0
        $billFull = $billing->computeBill($stay, '2026-11-21', 0.0, 2100.0);
        $this->assertEquals(0.00, $billFull['total']);
        $this->assertEquals(0.00, $billFull['balance']);
        $this->assertEquals(0.00, $billFull['outstandingBalance']);
    }

    public function testRevenueTotalsExcludesDiscountsFromCollectedRoomRevenue(): void
    {
        // Insert invoice 1: Normal invoice without discount (Room: 2000, GST: 100, Total: 2100)
        $this->db->prepare('
            INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, discount_amount, advance_paid, balance_amount, created_at)
            VALUES (1, 101, "INV-01", "2026-27", 2100.0, 2000.0, 100.0, 0.0, 0.0, 0.0, 0.0, 0.0, "2026-11-25 10:00:00")
        ')->execute();

        // Insert invoice 2: Full discount invoice (Room: 3000, GST: 150, Discount: 3150, Total: 0)
        $this->db->prepare('
            INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, discount_amount, advance_paid, balance_amount, created_at)
            VALUES (1, 102, "INV-02", "2026-27", 0.0, 3000.0, 150.0, 0.0, 0.0, 3150.0, 0.0, 0.0, "2026-11-25 11:00:00")
        ')->execute();

        // Insert invoice 3: Partial discount invoice (Room: 4000, GST: 200, Discount: 1000, Total: 3200)
        $this->db->prepare('
            INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, discount_amount, advance_paid, balance_amount, created_at)
            VALUES (1, 103, "INV-03", "2026-27", 3200.0, 4000.0, 200.0, 0.0, 0.0, 1000.0, 0.0, 0.0, "2026-11-25 12:00:00")
        ')->execute();

        $totals = $this->reportRepo->revenueTotals(1, '2026-11-25', '2026-11-25');

        $this->assertSame(3, $totals['invoiceCount']);
        // Total collected revenue: 2100 + 0 + 3200 = 5300
        $this->assertEquals(5300.00, $totals['total']);
        // Room amount after discount: 2000 (inv 1) + 0 (inv 2 fully discounted) + 3000 (inv 3: 4000 - 1000) = 5000
        $this->assertEquals(5000.00, $totals['roomAmount']);
        // GST: 100 (inv 1) + 0 (inv 2 total is 0) + 200 (inv 3) = 300
        $this->assertEquals(300.00, $totals['gstAmount']);
    }

    public function testInvoicesCsvDateFormattingAsYmdForExcel(): void
    {
        $this->db->prepare('
            INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, discount_amount, advance_paid, balance_amount, created_at)
            VALUES (1, 201, "INV-2026-001", "2026-27", 1500.0, 1500.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "2026-11-25 16:45:30")
        ')->execute();

        $invoiceRepo = new InvoiceRepository($this->db);
        $service = new ReportService($this->reportRepo, $invoiceRepo);
        $csv = $service->invoicesCsv(1, '2026-11-25', '2026-11-25');

        // CSV must contain date formatted as YYYY-MM-DD (2026-11-25) without timestamp
        $this->assertStringContainsString('2026-11-25', $csv);
        $this->assertStringNotContainsString('16:45:30', $csv, 'Timestamp must be stripped to prevent Excel ######## column overflow');
    }
}
