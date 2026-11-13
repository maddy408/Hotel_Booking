<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\InvoiceService;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * GST slabs, room-type-wise calculations, multiple-night stays,
 * independent extra charges tax, CGST/SGST/IGST breakups, and invoice integrity.
 */
final class BillingAndInvoiceTest extends TestCase
{
    private PDO $db;
    private BillingService $billing;
    private InvoiceService $invoiceService;
    private StayRepository $stays;
    private GstService $gstService;
    private SettingsRepository $settingsRepo;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->db->beginTransaction();
        $this->settingsRepo = new SettingsRepository($this->db);
        $this->gstService = new GstService($this->settingsRepo);
        $hotelRepo = new HotelRepository($this->db);
        $this->billing = new BillingService(
            $this->gstService,
            new StayChargeRepository($this->db),
            new PaymentRepository($this->db),
            $this->settingsRepo,
            $hotelRepo
        );
        $this->invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db), $hotelRepo, $this->gstService);
        $this->stays = new StayRepository($this->db);
    }

    protected function tearDown(): void
    {
        if ($this->db->inTransaction()) {
            $this->db->rollBack();
        }
    }

    /**
     * Mandatory Test Cases: Section 10
     * Tests 1 to 9: 500, 1500, 3000, 7000, 7500, 7501, 8000, 10000, 15000
     */
    public function testMandatoryGstTestCases(): void
    {
        $testCases = [
            1 => ['tariff' => 500.0, 'expectedGst' => 0.05],
            2 => ['tariff' => 1500.0, 'expectedGst' => 0.05],
            3 => ['tariff' => 3000.0, 'expectedGst' => 0.05],
            4 => ['tariff' => 7000.0, 'expectedGst' => 0.05],
            5 => ['tariff' => 7500.0, 'expectedGst' => 0.05],
            6 => ['tariff' => 7501.0, 'expectedGst' => 0.18],
            7 => ['tariff' => 8000.0, 'expectedGst' => 0.18],
            8 => ['tariff' => 10000.0, 'expectedGst' => 0.18],
            9 => ['tariff' => 15000.0, 'expectedGst' => 0.18],
        ];

        foreach ($testCases as $caseNum => $c) {
            $slab = $this->gstService->slabFor(1, $c['tariff']);
            $this->assertSame(
                $c['expectedGst'],
                $slab['rate'],
                "Test case {$caseNum} failed for tariff {$c['tariff']}: expected {$c['expectedGst']}, got {$slab['rate']}"
            );
        }
    }

    /**
     * Critical Rule: Room-type-wise calculation depends on actual nightly tariff,
     * NOT the room type name.
     * E.g. Standard Room at 8,000 gets 18%; Suite at 7,000 gets 5%.
     */
    public function testGstDependsOnTariffNotRoomTypeName(): void
    {
        // Standard room priced at 8000 (above 7,500) -> 18%
        $stdAboveThreshold = $this->gstService->slabFor(1, 8000.0);
        $this->assertSame(0.18, $stdAboveThreshold['rate']);

        // Suite priced at 7000 (below 7,500) -> 5%
        $suiteBelowThreshold = $this->gstService->slabFor(1, 7000.0);
        $this->assertSame(0.05, $suiteBelowThreshold['rate']);
    }

    /**
     * Multiple-Night Booking Calculation: Section 4
     * Room tariff: 5,000 per night for 3 nights
     * Night 1: 5,000 -> 5%
     * Night 2: 5,000 -> 5%
     * Night 3: 5,000 -> 5%
     * Total room amount: 15,000. Total GST: 750.
     * Must not determine GST using the total booking amount (15,000 > 7,500) which would incorrectly give 18%.
     */
    public function testMultipleNightBookingCalculation(): void
    {
        $calc = $this->gstService->calculateAccommodation(1, 5000.0, 3);
        $this->assertEqualsWithDelta(15000.00, $calc['room_amount'], 0.01);
        $this->assertEqualsWithDelta(750.00, $calc['tax_amount'], 0.01);
        $this->assertSame(0.05, $calc['gst_rate']);
        $this->assertCount(3, $calc['nights_breakdown']);

        foreach ($calc['nights_breakdown'] as $night) {
            $this->assertEqualsWithDelta(5000.00, $night['tariff'], 0.01);
            $this->assertSame(0.05, $night['gst_rate']);
            $this->assertEqualsWithDelta(250.00, $night['tax_amount'], 0.01);
        }
    }

    /**
     * Stay with different nightly tariffs: each night calculated separately.
     * Night 1: 5,000 (5% = 250)
     * Night 2: 8,000 (18% = 1440)
     * Total room amount: 13,000, Total GST: 1690.
     */
    public function testDifferentNightlyTariffsCalculation(): void
    {
        $calc = $this->gstService->calculateAccommodation(1, [5000.0, 8000.0]);
        $this->assertEqualsWithDelta(13000.00, $calc['room_amount'], 0.01);
        $this->assertEqualsWithDelta(1690.00, $calc['tax_amount'], 0.01);
        $this->assertSame(0.05, $calc['nights_breakdown'][0]['gst_rate']);
        $this->assertSame(0.18, $calc['nights_breakdown'][1]['gst_rate']);
    }

    public function testBillTotalForFiveSlabRoomWithUntaxedExtra(): void
    {
        $roomId = $this->roomId(102);
        $stay = $this->stays->findInHouseByRoom($roomId);
        if ($stay === null) {
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $checkIn = date('Y-m-d', strtotime('-2 days'));
            $checkOut = date('Y-m-d', strtotime('+1 day'));
            $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 2200, :cin, :cout, 'in_house')")
                ->execute(['r' => $roomId, 'g' => $guestId, 'cin' => $checkIn, 'cout' => $checkOut]);
            $stayId = (int) $this->db->lastInsertId();
            $this->db->prepare("INSERT INTO stay_charges (stay_id, label, amount, is_taxable) VALUES (:s, 'Food', 640, 0)")
                ->execute(['s' => $stayId]);
            $stay = $this->stays->findInHouseByRoom($roomId);
        } else {
            $hasCharge = (int) $this->db->query("SELECT COUNT(*) FROM stay_charges WHERE stay_id = {$stay['id']} AND amount = 640")->fetchColumn();
            if ($hasCharge === 0) {
                $this->db->prepare("INSERT INTO stay_charges (stay_id, label, amount, is_taxable) VALUES (:s, 'Food', 640, 0)")
                    ->execute(['s' => (int) $stay['id']]);
            }
        }
        $this->assertNotNull($stay);

        $bill = $this->billing->computeBill($stay);
        $expectedNights = \App\Service\BillingService::nightsBetween($stay['check_in_date'], date('Y-m-d'));
        $rate = (float) $stay['rate'];
        $this->assertSame($expectedNights, $bill['nights']);
        $this->assertEqualsWithDelta($expectedNights * $rate, $bill['roomAmount'], 0.01);
        $this->assertEqualsWithDelta($expectedNights * $rate * 0.05, $bill['roomGstAmount'], 0.01); // 5% of roomAmount
        $this->assertEqualsWithDelta(640.0, $bill['extrasAmount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $bill['extrasGstAmount'], 0.01);
        $this->assertEqualsWithDelta($expectedNights * $rate * 1.05 + 640, $bill['total'], 0.01);
    }

    public function testBillTotalForEighteenPercentSlabRoom(): void
    {
        $roomId = $this->roomId(310);
        $stay = $this->stays->findInHouseByRoom($roomId);
        if ($stay === null) {
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $checkIn = date('Y-m-d', strtotime('-2 days'));
            $checkOut = date('Y-m-d', strtotime('+1 day'));
            $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 8500, :cin, :cout, 'in_house')")
                ->execute(['r' => $roomId, 'g' => $guestId, 'cin' => $checkIn, 'cout' => $checkOut]);
            $stay = $this->stays->findInHouseByRoom($roomId);
        }
        $this->assertNotNull($stay);

        $bill = $this->billing->computeBill($stay);
        $this->assertSame(0.18, $bill['gstRate']);
        $this->assertEqualsWithDelta($bill['roomAmount'] * 0.18, $bill['roomGstAmount'], 0.01);
    }

    /**
     * Extra charges independent GST: Food SAC 996331 is 5%, Laundry SAC 999719 is 18%.
     * Does not automatically use room GST rate.
     */
    public function testExtraChargesIndependentGst(): void
    {
        $foodTax = $this->gstService->taxForExtraCharge(1, 'Dinner Food Order', 1000.0, true);
        $this->assertSame('Food', $foodTax['category']);
        $this->assertSame('996331', $foodTax['sac_code']);
        $this->assertSame(0.05, $foodTax['gst_rate']);
        $this->assertEqualsWithDelta(50.00, $foodTax['gst_amount'], 0.01);

        $laundryTax = $this->gstService->taxForExtraCharge(1, 'Express Laundry', 1000.0, true);
        $this->assertSame('Laundry', $laundryTax['category']);
        $this->assertSame('999719', $laundryTax['sac_code']);
        $this->assertSame(0.18, $laundryTax['gst_rate']);
        $this->assertEqualsWithDelta(180.00, $laundryTax['gst_amount'], 0.01);
    }

    /**
     * CGST and SGST / IGST breakup: Section 9
     */
    public function testTaxBreakupIntraStateAndInterState(): void
    {
        // Hotel is registered in Tamil Nadu (state code '33')
        $hotelGstin = '33AAAAA0000A1Z5';

        // Intra-state guest (same state or empty GSTIN): 5% GST = 2.5% CGST + 2.5% SGST
        $intra = $this->gstService->calculateTaxBreakup(100.0, $hotelGstin, '33BBBBB1111B1Z2');
        $this->assertFalse($intra['is_inter_state']);
        $this->assertEqualsWithDelta(50.0, $intra['cgst_amount'], 0.01);
        $this->assertEqualsWithDelta(50.0, $intra['sgst_amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $intra['igst_amount'], 0.01);

        // Inter-state guest (Karnataka '29'): 5% GST = 5% IGST
        $inter = $this->gstService->calculateTaxBreakup(100.0, $hotelGstin, '29CCCCC2222C1Z3');
        $this->assertTrue($inter['is_inter_state']);
        $this->assertEqualsWithDelta(0.0, $inter['cgst_amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $inter['sgst_amount'], 0.01);
        $this->assertEqualsWithDelta(100.0, $inter['igst_amount'], 0.01);
    }

    /**
     * Historical Invoice Protection: Section 8
     * Changing GST settings must never change existing generated invoices.
     */
    public function testExistingInvoicesArePreservedWhenSettingsChange(): void
    {
        $existingInvoice = $this->db->query('SELECT * FROM invoices LIMIT 1')->fetch(PDO::FETCH_ASSOC);
        if ($existingInvoice) {
            $origTotal = (float) $existingInvoice['total_amount'];
            $origGstRate = (float) $existingInvoice['gst_rate'];
            $origRoomGst = (float) $existingInvoice['room_gst_amount'];

            // Simulate changing GST settings to 12% / 28%
            $this->settingsRepo->update(1, [
                'gst_slab1_gst_rate' => 0.12,
                'gst_slab2_gst_rate' => 0.28,
            ]);

            // Re-fetch invoice
            $invRepo = new InvoiceRepository($this->db);
            $reloaded = $invRepo->find((int) $existingInvoice['id']);
            $this->assertEqualsWithDelta($origTotal, (float) $reloaded['total_amount'], 0.01);
            $this->assertEqualsWithDelta($origGstRate, (float) $reloaded['gst_rate'], 0.0001);
            $this->assertEqualsWithDelta($origRoomGst, (float) $reloaded['room_gst_amount'], 0.01);
        } else {
            $this->assertTrue(true);
        }
    }

    public function testInvoiceSequenceIncrementsWithinTheSameFinancialYear(): void
    {
        $settings = $this->invoiceService->lockMutex(1);
        $fy = $this->invoiceService->financialYear(date('Y-m-d'), (int) $settings['financial_year_start_month']);

        $bill = ['roomAmount' => 2200.0, 'gstRate' => 0.05, 'roomGstAmount' => 110.0, 'extrasAmount' => 0.0, 'extrasGstAmount' => 0.0, 'total' => 2310.0, 'advancePaid' => 2200.0, 'balance' => 110.0];

        [$stayId, $secondStayId] = $this->twoInHouseStayIds();
        $first = $this->invoiceService->issue(1, $stayId, $settings, $bill, null);
        $second = $this->invoiceService->issue(1, $secondStayId, $settings, $bill, null);

        $this->assertSame($first['sequence_no'] + 1, $second['sequence_no']);
        $this->assertStringContainsString($fy, $first['invoice_number']);
        $this->assertStringContainsString($fy, $second['invoice_number']);
    }

    public function testFinancialYearRollsOverAtTheConfiguredStartMonth(): void
    {
        $this->assertSame('2025-26', $this->invoiceService->financialYear('2026-03-31', 4));
        $this->assertSame('2026-27', $this->invoiceService->financialYear('2026-04-01', 4));
    }

    private function roomId(int $roomNo): int
    {
        $stmt = $this->db->prepare('SELECT id FROM rooms WHERE hotel_id = 1 AND room_no = :no');
        $stmt->execute(['no' => $roomNo]);
        return (int) $stmt->fetchColumn();
    }

    /** @return array{0:int,1:int} */
    private function twoInHouseStayIds(): array
    {
        $rows = $this->db->query("SELECT id FROM stays WHERE hotel_id = 1 AND status = 'in_house' ORDER BY id LIMIT 2")
            ->fetchAll(PDO::FETCH_COLUMN);
        while (count($rows) < 2) {
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $roomId = (int) $this->db->query("SELECT id FROM rooms WHERE hotel_id = 1 AND id NOT IN (SELECT room_id FROM stays WHERE status = 'in_house') LIMIT 1")->fetchColumn();
            $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 2000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'in_house')")
                ->execute(['r' => $roomId, 'g' => $guestId]);
            $rows[] = (int) $this->db->lastInsertId();
        }
        return [(int) $rows[0], (int) $rows[1]];
    }
}
