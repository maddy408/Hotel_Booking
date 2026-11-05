<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
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

/** GST slabs, bill totals and sequential invoice numbering, against the real seeded DB. */
final class BillingAndInvoiceTest extends TestCase
{
    private PDO $db;
    private BillingService $billing;
    private InvoiceService $invoiceService;
    private StayRepository $stays;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->db->beginTransaction();
        $settingsRepo = new SettingsRepository($this->db);
        $this->billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), new PaymentRepository($this->db));
        $this->invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));
        $this->stays = new StayRepository($this->db);
    }

    protected function tearDown(): void
    {
        if ($this->db->inTransaction()) {
            $this->db->rollBack();
        }
    }

    public function testGstSlabBoundaries(): void
    {
        $gst = new GstService(new SettingsRepository($this->db));
        $this->assertSame(0.0, $gst->slabFor(1, 1000.0)['rate']);   // at the 0% ceiling
        $this->assertSame(0.05, $gst->slabFor(1, 1000.01)['rate']); // just over it -> 5%
        $this->assertSame(0.05, $gst->slabFor(1, 7500.0)['rate']);  // at the 5% ceiling
        $this->assertSame(0.18, $gst->slabFor(1, 7500.01)['rate']); // just over it -> 18%
    }

    public function testBillTotalForFiveSlabRoomWithUntaxedExtra(): void
    {
        // Room 102 in the seed: STD rate 2200 (5% slab), check-in 2 days ago, has a Food 640 extra.
        $roomId = $this->roomId(102);
        $stay = $this->stays->findInHouseByRoom($roomId);
        $this->assertNotNull($stay);

        $bill = $this->billing->computeBill($stay);
        $this->assertSame(2, $bill['nights']); // today - (today-2) = 2
        $this->assertEqualsWithDelta(4400.0, $bill['roomAmount'], 0.01);
        $this->assertEqualsWithDelta(220.0, $bill['roomGstAmount'], 0.01); // 5% of 4400
        $this->assertEqualsWithDelta(640.0, $bill['extrasAmount'], 0.01);
        $this->assertEqualsWithDelta(0.0, $bill['extrasGstAmount'], 0.01); // tax_extras is off by default
        $this->assertEqualsWithDelta(4400 + 220 + 640, $bill['total'], 0.01);
    }

    public function testBillTotalForEighteenPercentSlabRoom(): void
    {
        // Room 310 in the seed: STE rate 8500 (>7500 -> 18% slab), no extras.
        $roomId = $this->roomId(310);
        $stay = $this->stays->findInHouseByRoom($roomId);
        $this->assertNotNull($stay);

        $bill = $this->billing->computeBill($stay);
        $this->assertSame(0.18, $bill['gstRate']);
        $this->assertEqualsWithDelta($bill['roomAmount'] * 0.18, $bill['roomGstAmount'], 0.01);
    }

    public function testInvoiceSequenceIncrementsWithinTheSameFinancialYear(): void
    {
        $settings = $this->invoiceService->lockMutex(1);
        $fy = $this->invoiceService->financialYear(date('Y-m-d'), (int) $settings['financial_year_start_month']);

        $bill = ['roomAmount' => 2200.0, 'gstRate' => 0.05, 'roomGstAmount' => 110.0, 'extrasAmount' => 0.0, 'extrasGstAmount' => 0.0, 'total' => 2310.0, 'advancePaid' => 2200.0, 'balance' => 110.0];

        // Use two in-house seeded stays (they never already have an invoice) just to satisfy the FK
        // and the invoices.stay_id unique constraint; both inserts are rolled back after the test.
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
        return [(int) $rows[0], (int) $rows[1]];
    }
}
