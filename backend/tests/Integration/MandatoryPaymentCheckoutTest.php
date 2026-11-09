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
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class MandatoryPaymentCheckoutTest extends TestCase
{
    private const HOTEL_ID = 997;
    private const ROOM_ID = 99701;
    private const GUEST_ID = 99701;

    private PDO $db;
    private StayService $stays;
    private PaymentRepository $payments;
    private InvoiceRepository $invoices;
    private StayRepository $stayRepo;
    private BillingService $billing;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // Seed dedicated test hotel, settings, room type, room, guest
        $this->db->exec("INSERT INTO hotels (id, name) VALUES (" . self::HOTEL_ID . ", 'Payment Test Hotel')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, financial_year_start_month) VALUES (" . self::HOTEL_ID . ", 'TESTINV', 12, 4)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9971, " . self::HOTEL_ID . ", 'STD', 'Standard Double', 2200, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id) VALUES (" . self::ROOM_ID . ", " . self::HOTEL_ID . ", 901, 9, 9971)");
        $this->db->exec("INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_proof_last4) VALUES (" . self::GUEST_ID . ", " . self::HOTEL_ID . ", 'Checkout Test Guest', '9999900001', 'Aadhaar', '9999')");

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $roomRepo = new RoomRepository($this->db);
        $reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->payments = new PaymentRepository($this->db);
        $this->invoices = new InvoiceRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($reservationRepo, $this->stayRepo);
        $this->billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $this->payments);
        $invoiceService = new InvoiceService($this->db, $this->invoices);

        $this->stays = new StayService(
            $this->db,
            $this->stayRepo,
            $reservationRepo,
            $roomRepo,
            new StayChargeRepository($this->db),
            $this->payments,
            new HousekeepingLogRepository($this->db),
            $settingsRepo,
            $guestService,
            $availability,
            $this->billing,
            $invoiceService,
            $audit,
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM payments WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM stay_charges WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = " . self::HOTEL_ID . ")");
        $this->db->exec("DELETE FROM housekeeping_logs WHERE room_id = " . self::ROOM_ID);
        $this->db->exec("DELETE FROM stays WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM guests WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM settings WHERE hotel_id = " . self::HOTEL_ID);
        $this->db->exec("DELETE FROM hotels WHERE id = " . self::HOTEL_ID);
    }

    private function createTestStay(float $rate = 2200.0, float $advance = 0.0): int
    {
        $today = date('Y-m-d');
        $checkoutPlanned = (new \DateTimeImmutable($today))->modify('+1 day')->format('Y-m-d');

        $stayId = $this->stayRepo->create(
            self::HOTEL_ID, null, self::ROOM_ID, self::GUEST_ID, 1, $rate, $today, $checkoutPlanned, 1, '12:00:00'
        );

        if ($advance > 0) {
            $this->payments->record(self::HOTEL_ID, null, $stayId, 'advance', $advance, 'upi', 1);
        }

        return $stayId;
    }

    public function testScenarioANoAdvancePaymentCollectsFullInvoiceAmount(): void
    {
        // 1 night @ 2200, 5% GST = 110, total = 2310. Advance = 0.
        $stayId = $this->createTestStay(2200.0, 0.0);

        $billBefore = $this->stays->bill($stayId, self::HOTEL_ID);
        $this->assertEqualsWithDelta(2310.0, $billBefore['total'], 0.01);
        $this->assertEqualsWithDelta(0.0, $billBefore['advancePaid'], 0.01);
        $this->assertEqualsWithDelta(2310.0, $billBefore['balance'], 0.01);

        // Checkout without specifying amount automatically collects full outstanding balance
        $result = $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1);

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertEqualsWithDelta(2310.0, $result['bill']['total'], 0.01);
        $this->assertEqualsWithDelta(0.0, $result['bill']['balance'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $result['invoice']['balance_amount'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $result['invoice']['advance_paid'], 0.01);

        // Verify payment record
        $payments = $this->payments->forStay($stayId);
        $this->assertCount(1, $payments);
        $this->assertSame('balance', $payments[0]['type']);
        $this->assertEqualsWithDelta(2310.0, (float) $payments[0]['amount'], 0.01);
        $this->assertSame('cash', $payments[0]['method']);
        $this->assertSame('successful', $payments[0]['status']);
    }

    public function testScenarioBPartialAdvancePaymentCollectsOnlyRemainingBalance(): void
    {
        // Rate 2200, 5% GST = 110, total = 2310. Advance = 1000. Balance to collect = 1310.
        $stayId = $this->createTestStay(2200.0, 1000.0);

        $billBefore = $this->stays->bill($stayId, self::HOTEL_ID);
        $this->assertEqualsWithDelta(2310.0, $billBefore['total'], 0.01);
        $this->assertEqualsWithDelta(1000.0, $billBefore['advancePaid'], 0.01);
        $this->assertEqualsWithDelta(1310.0, $billBefore['balance'], 0.01);

        // Checkout with exact remaining amount
        $result = $this->stays->checkout($stayId, self::HOTEL_ID, 'upi', null, 1, 1310.0);

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertEqualsWithDelta(0.0, $result['bill']['balance'], 0.01);
        $this->assertEqualsWithDelta(0.0, (float) $result['invoice']['balance_amount'], 0.01);
        $this->assertEqualsWithDelta(1000.0, (float) $result['invoice']['advance_paid'], 0.01);

        // Both advance and checkout payments preserved
        $payments = $this->payments->forStay($stayId);
        $this->assertCount(2, $payments);
        $this->assertSame('advance', $payments[0]['type']);
        $this->assertEqualsWithDelta(1000.0, (float) $payments[0]['amount'], 0.01);
        $this->assertSame('balance', $payments[1]['type']);
        $this->assertEqualsWithDelta(1310.0, (float) $payments[1]['amount'], 0.01);
    }

    public function testScenarioCFullAdvancePaymentAllowsCheckoutWithoutAdditionalCollection(): void
    {
        // Rate 2200, 5% GST = 110, total = 2310. Full advance = 2310. Balance = 0.
        $stayId = $this->createTestStay(2200.0, 2310.0);

        $billBefore = $this->stays->bill($stayId, self::HOTEL_ID);
        $this->assertEqualsWithDelta(0.0, $billBefore['balance'], 0.01);

        $result = $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 0.0);

        $this->assertSame('checked_out', $result['stay']['status']);
        $this->assertEqualsWithDelta(0.0, (float) $result['invoice']['balance_amount'], 0.01);
        $this->assertEqualsWithDelta(2310.0, (float) $result['invoice']['advance_paid'], 0.01);

        // No new payment row created, only the original advance exists
        $payments = $this->payments->forStay($stayId);
        $this->assertCount(1, $payments);
        $this->assertSame('advance', $payments[0]['type']);
    }

    public function testPartialCheckoutPaymentIsRejected(): void
    {
        // Total = 2310. Advance = 1000. Balance = 1310.
        $stayId = $this->createTestStay(2200.0, 1000.0);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Partial payment is not allowed');

        // Attempt partial payment of 500 instead of 1310
        $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 500.0);
    }

    public function testExcessiveCheckoutPaymentIsRejected(): void
    {
        // Total = 2310. Advance = 1000. Balance = 1310.
        $stayId = $this->createTestStay(2200.0, 1000.0);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('exceeds outstanding balance');

        // Attempt excessive payment of 2000 instead of 1310
        $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 2000.0);
    }

    public function testPendingPaymentDoesNotCountTowardSettlement(): void
    {
        $stayId = $this->createTestStay(2200.0, 0.0);

        // Record a pending payment
        $this->payments->record(self::HOTEL_ID, null, $stayId, 'balance', 2310.0, 'upi', 1, 'Pending payment', 'pending');

        $bill = $this->stays->bill($stayId, self::HOTEL_ID);
        // Balance must still be 2310 because pending is not settled
        $this->assertEqualsWithDelta(2310.0, $bill['balance'], 0.01);
    }

    public function testFailedPaymentDoesNotCountTowardSettlement(): void
    {
        $stayId = $this->createTestStay(2200.0, 0.0);

        // Record a failed payment
        $this->payments->record(self::HOTEL_ID, null, $stayId, 'balance', 2310.0, 'card', 1, 'Card declined', 'failed');

        $bill = $this->stays->bill($stayId, self::HOTEL_ID);
        // Balance must still be 2310 because failed is not settled
        $this->assertEqualsWithDelta(2310.0, $bill['balance'], 0.01);
    }

    public function testRepeatedCheckoutRequestRejectsDuplicatePayment(): void
    {
        $stayId = $this->createTestStay(2200.0, 0.0);

        // First checkout succeeds
        $result = $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1);
        $this->assertSame('checked_out', $result['stay']['status']);

        // Second checkout must fail with conflict and must not create duplicate payment
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('This stay is already checked out');

        $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1);
    }

    public function testInvoiceControllerReturnsCompletePaymentSummaryAndZeroBalanceAfterCheckout(): void
    {
        $hotelRepo = new \App\Repository\HotelRepository($this->db);
        $chargesRepo = new StayChargeRepository($this->db);
        $invoiceController = new \App\Controller\InvoiceController(
            $this->invoices,
            $this->stayRepo,
            $chargesRepo,
            $hotelRepo,
            $this->payments
        );

        // 1 night @ 2200 + 5% GST = 2310. Advance = 1000. Balance to collect = 1310.
        $stayId = $this->createTestStay(2200.0, 1000.0);
        $checkoutResult = $this->stays->checkout($stayId, self::HOTEL_ID, 'cash', null, 1, 1310.0);

        $request = new \App\Router\Request('GET', '/stays/' . $stayId . '/invoice', [], [], [], '127.0.0.1');
        $request->routeParams = ['stayId' => (string) $stayId];
        $request->setAttribute('hotelId', self::HOTEL_ID);

        $payload = $invoiceController->byStay($request);

        $this->assertArrayHasKey('invoice', $payload);
        $this->assertArrayHasKey('payments', $payload);
        $this->assertArrayHasKey('paymentSummary', $payload);

        $summary = $payload['paymentSummary'];
        $this->assertEqualsWithDelta(1000.0, $summary['advancePaid'], 0.01);
        $this->assertEqualsWithDelta(1310.0, $summary['checkoutPaid'], 0.01);
        $this->assertEqualsWithDelta(2310.0, $summary['totalPaid'], 0.01);
        $this->assertEqualsWithDelta(0.0, $summary['balance'], 0.01);

        $this->assertCount(2, $payload['payments']);
        $this->assertSame('advance', $payload['payments'][0]['type']);
        $this->assertSame('upi', $payload['payments'][0]['method']);
        $this->assertSame('balance', $payload['payments'][1]['type']);
        $this->assertSame('cash', $payload['payments'][1]['method']);
    }
}
