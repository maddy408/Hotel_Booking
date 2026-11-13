<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HotelRepository;
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
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Comprehensive verification of Room-Type-Wise GST implementation:
 * 1. Mandatory tariffs (500, 1500, 3000, 7000, 7500, 7501, 8000, 10000, 15000)
 * 2. Room types below & above threshold
 * 3. Tariff vs Room-type independence (Standard at 8k vs Suite at 7k)
 * 4. Room tariff modification and recalculation
 * 5. Multi-night stay calculation (evaluated nightly, not on total)
 * 6. Stays with different nightly tariffs
 * 7. Complete Reservation -> Check-in -> Extras -> Checkout -> Invoice workflow
 * 8. Independent extra charges GST (Food 5%, Laundry 18%, etc.)
 * 9. Intra-state (CGST+SGST) vs Inter-state (IGST) tax breakup
 * 10. Historical invoice protection when GST settings change
 * 11. Settings persistence across reloads
 */
final class RoomTypeWiseGstImplementationTest extends TestCase
{
    private const HOTEL_ID = 991;
    private PDO $db;
    private SettingsRepository $settingsRepo;
    private GstService $gstService;
    private HotelRepository $hotelRepo;
    private RoomRepository $roomRepo;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private StayChargeRepository $chargeRepo;
    private PaymentRepository $paymentRepo;
    private InvoiceRepository $invoiceRepo;
    private ReservationService $reservationService;
    private StayService $stayService;
    private BillingService $billingService;
    private InvoiceService $invoiceService;

    private int $roomIdStd;
    private int $roomIdSuite;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        // 1. Hotel registered in Tamil Nadu (state code '33')
        $this->db->exec("INSERT INTO hotels (id, name, place, gstin, address) VALUES (" . self::HOTEL_ID . ", 'Tamarind Court GST Test', 'Tenkasi', '33AAAAA1111A1Z1', '12 Main Rd, Tenkasi')");

        // 2. Settings configured with 7,500 threshold: Slab 1 (5%), Slab 2 (18%), Slab 3 (18%)
        $this->db->exec("INSERT INTO settings (
            hotel_id, invoice_prefix, checkout_hour, timezone,
            gst_slab1_max_rate, gst_slab1_gst_rate, gst_slab2_max_rate, gst_slab2_gst_rate, gst_slab3_gst_rate,
            tax_extras, extra_food_gst_rate, extra_laundry_gst_rate, extra_bed_gst_rate, extra_taxi_gst_rate, extra_other_gst_rate
        ) VALUES (
            " . self::HOTEL_ID . ", 'GSTTEST', 12, 'Asia/Kolkata',
            7500.00, 0.0500, 7500.00, 0.1800, 0.1800,
            1, 0.0500, 0.1800, 0.0500, 0.0500, 0.1800
        )");

        // 3. Room types: Standard (1500), Deluxe (3000), Super Deluxe (5000), Premium (7500), Family (8000), Suite (12000)
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES
            (9911, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 1500.00, 2),
            (9912, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 3000.00, 2),
            (9913, " . self::HOTEL_ID . ", 'SDLX', 'Super Deluxe Room', 5000.00, 3),
            (9914, " . self::HOTEL_ID . ", 'PREM', 'Premium Room', 7500.00, 3),
            (9915, " . self::HOTEL_ID . ", 'FAM', 'Family Room', 8000.00, 4),
            (9916, " . self::HOTEL_ID . ", 'STE', 'Suite Room', 12000.00, 4)");

        // 4. Physical rooms
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES
            (99101, " . self::HOTEL_ID . ", 101, 1, 9911, 'ok'),
            (99106, " . self::HOTEL_ID . ", 106, 1, 9916, 'ok')");
        $this->roomIdStd = 99101;
        $this->roomIdSuite = 99106;

        // 5. Repositories and Services
        $this->settingsRepo = new SettingsRepository($this->db);
        $this->gstService = new GstService($this->settingsRepo);
        $this->hotelRepo = new HotelRepository($this->db);
        $this->roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $this->chargeRepo = new StayChargeRepository($this->db);
        $this->paymentRepo = new PaymentRepository($this->db);
        $this->invoiceRepo = new InvoiceRepository($this->db);

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'));
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $hkLogs = new HousekeepingLogRepository($this->db);

        $this->billingService = new BillingService(
            $this->gstService,
            $this->chargeRepo,
            $this->paymentRepo,
            $this->settingsRepo,
            $this->hotelRepo
        );

        $this->invoiceService = new InvoiceService(
            $this->db,
            $this->invoiceRepo,
            $this->hotelRepo,
            $this->gstService
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $this->roomRepo,
            $guestService,
            $availability,
            $this->paymentRepo,
            $this->settingsRepo,
            $audit,
            $this->stayRepo,
            $this->gstService
        );

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $this->roomRepo,
            $this->chargeRepo,
            $this->paymentRepo,
            $hkLogs,
            $this->settingsRepo,
            $guestService,
            $availability,
            $this->billingService,
            $this->invoiceService,
            $audit,
            $this->gstService
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        $hId = self::HOTEL_ID;
        $this->db->exec("DELETE FROM invoices WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM payments WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = {$hId}) OR reservation_id IN (SELECT id FROM reservations WHERE hotel_id = {$hId})");
        $this->db->exec("DELETE FROM stay_charges WHERE stay_id IN (SELECT id FROM stays WHERE hotel_id = {$hId})");
        $this->db->exec("DELETE FROM stays WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM reservations WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM room_types WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM guests WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM settings WHERE hotel_id = {$hId}");
        $this->db->exec("DELETE FROM hotels WHERE id = {$hId}");
    }

    /**
     * Requirement 10: Mandatory Tariff Test Cases
     * 500, 1500, 3000, 7000, 7500 -> 5%
     * 7501, 8000, 10000, 15000 -> 18%
     */
    public function testMandatoryNightlyTariffs(): void
    {
        $cases = [
            1 => ['tariff' => 500.0, 'expected' => 0.05],
            2 => ['tariff' => 1500.0, 'expected' => 0.05],
            3 => ['tariff' => 3000.0, 'expected' => 0.05],
            4 => ['tariff' => 7000.0, 'expected' => 0.05],
            5 => ['tariff' => 7500.0, 'expected' => 0.05],
            6 => ['tariff' => 7501.0, 'expected' => 0.18],
            7 => ['tariff' => 8000.0, 'expected' => 0.18],
            8 => ['tariff' => 10000.0, 'expected' => 0.18],
            9 => ['tariff' => 15000.0, 'expected' => 0.18],
        ];

        foreach ($cases as $num => $c) {
            $slab = $this->gstService->slabFor(self::HOTEL_ID, $c['tariff']);
            $this->assertSame(
                $c['expected'],
                $slab['rate'],
                "Test case {$num} failed for tariff {$c['tariff']}"
            );
        }
    }

    /**
     * Requirement 3: GST must not be tied to room type names.
     * Standard Room at 8,000 must get 18%. Suite at 7,000 must get 5%.
     */
    public function testGstCalculationIsIndependentOfRoomTypeName(): void
    {
        // Standard room sold at 8000
        $stdRate = 8000.0;
        $stdSlab = $this->gstService->slabFor(self::HOTEL_ID, $stdRate);
        $this->assertSame(0.18, $stdSlab['rate'], 'Standard Room at ₹8,000 must receive 18% GST');

        // Suite sold at 7000
        $suiteRate = 7000.0;
        $suiteSlab = $this->gstService->slabFor(self::HOTEL_ID, $suiteRate);
        $this->assertSame(0.05, $suiteSlab['rate'], 'Suite Room at ₹7,000 must receive 5% GST');
    }

    /**
     * Requirement 4: Multi-Night Booking Calculation
     * Room tariff: 5,000 per night for 3 nights.
     * Total room: 15,000. GST must be 750 (5%), NOT 18% on total 15,000.
     */
    public function testMultipleNightStayCalculatedPerNight(): void
    {
        $calc = $this->gstService->calculateAccommodation(self::HOTEL_ID, 5000.0, 3);
        $this->assertEqualsWithDelta(15000.00, $calc['room_amount'], 0.01);
        $this->assertEqualsWithDelta(750.00, $calc['tax_amount'], 0.01);
        $this->assertSame(0.05, $calc['gst_rate']);
        $this->assertCount(3, $calc['nights_breakdown']);

        foreach ($calc['nights_breakdown'] as $n) {
            $this->assertEqualsWithDelta(5000.0, $n['tariff'], 0.01);
            $this->assertSame(0.05, $n['gst_rate']);
            $this->assertEqualsWithDelta(250.0, $n['tax_amount'], 0.01);
        }
    }

    /**
     * Requirement 4 & 10.6: Stays with different nightly tariffs
     * Night 1: 5,000 (5% = 250)
     * Night 2: 8,000 (18% = 1440)
     * Total: 13,000 room + 1,690 tax = 14,690
     */
    public function testDifferentNightlyTariffs(): void
    {
        $calc = $this->gstService->calculateAccommodation(self::HOTEL_ID, [5000.0, 8000.0]);
        $this->assertEqualsWithDelta(13000.00, $calc['room_amount'], 0.01);
        $this->assertEqualsWithDelta(1690.00, $calc['tax_amount'], 0.01);
        $this->assertSame(0.05, $calc['nights_breakdown'][0]['gst_rate']);
        $this->assertSame(0.18, $calc['nights_breakdown'][1]['gst_rate']);
    }

    /**
     * Requirement 10.3: Modify room tariff and verify recalculation for a new booking
     */
    public function testRoomTariffModificationUpdatesNewBookingGst(): void
    {
        // 1. Initial reservation at 3000 (5%)
        $res1 = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomIdStd,
            '9876543210',
            'Guest One',
            date('Y-m-d', strtotime('+10 days')),
            date('Y-m-d', strtotime('+11 days')),
            2,
            3000.00,
            500.00,
            'upi',
            null
        );
        $this->assertSame(0.05, (float) $res1['gst_rate']);
        $this->assertEqualsWithDelta(150.00, (float) $res1['tax_amount'], 0.01);
        $this->assertEqualsWithDelta(3150.00, (float) $res1['total_amount'], 0.01);

        // 2. Room tariff changed to 8500 (above 7,500 threshold)
        $this->db->prepare('UPDATE room_types SET rate = 8500.00 WHERE id = 9911')->execute();

        // 3. New booking for later date at new tariff of 8500 (18%)
        $res2 = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomIdStd,
            '9876543211',
            'Guest Two',
            date('Y-m-d', strtotime('+20 days')),
            date('Y-m-d', strtotime('+21 days')),
            2,
            8500.00,
            1000.00,
            'card',
            null
        );
        $this->assertSame(0.18, (float) $res2['gst_rate']);
        $this->assertEqualsWithDelta(1530.00, (float) $res2['tax_amount'], 0.01);
        $this->assertEqualsWithDelta(10030.00, (float) $res2['total_amount'], 0.01);
    }

    /**
     * Requirement 5, 6, 7, 8, 9:
     * Full End-to-End Workflow:
     * Reservation -> Check-in -> Extra charges (Food + Laundry) -> Checkout -> Invoice
     * With independent extra charges taxes and CGST/SGST or IGST breakup.
     */
    public function testFullEndToEndReservationToInvoiceWorkflow(): void
    {
        // 1. Create Reservation: 2 nights at 8,000/night (Slab 2: 18%)
        $today = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));
        $res = $this->reservationService->create(
            self::HOTEL_ID,
            $this->roomIdStd,
            '9840112233',
            'Rajesh Kumar',
            $today,
            $checkOut,
            2,
            8000.00,
            2000.00,
            'cash',
            1
        );
        $this->assertSame(0.18, (float) $res['gst_rate']);
        $this->assertEqualsWithDelta(2880.00, (float) $res['tax_amount'], 0.01); // 16,000 * 18% = 2,880

        // 2. Check-in guest from reservation
        $stay = $this->stayService->checkInFromReservation((int) $res['id'], self::HOTEL_ID, 1);
        $this->assertSame(0.18, (float) $stay['gst_rate']);
        $this->assertEqualsWithDelta(2880.00, (float) $stay['room_gst_amount'], 0.01);

        // 3. Add extra charges:
        // Food SAC 996331 @ 5% = 1,000 * 5% = 50
        // Laundry SAC 999719 @ 18% = 500 * 18% = 90
        $this->stayService->addExtra((int) $stay['id'], self::HOTEL_ID, 'Dinner Food Order', 1000.00, true, 1);
        $this->stayService->addExtra((int) $stay['id'], self::HOTEL_ID, 'Express Laundry Service', 500.00, true, 1);

        // 4. Compute bill for planned checkout
        $bill = $this->billingService->computeBill($stay, $checkOut);
        $this->assertSame(2, $bill['nights']);
        $this->assertEqualsWithDelta(16000.00, $bill['roomAmount'], 0.01);
        $this->assertEqualsWithDelta(2880.00, $bill['roomGstAmount'], 0.01);
        $this->assertEqualsWithDelta(1500.00, $bill['extrasAmount'], 0.01);
        $this->assertEqualsWithDelta(140.00, $bill['extrasGstAmount'], 0.01); // 50 + 90
        $this->assertEqualsWithDelta(20520.00, $bill['total'], 0.01); // 16000 + 2880 + 1500 + 140

        // 5. Checkout and issue final invoice
        $balance = $bill['balance']; // 20520 - 2000 = 18520
        $checkoutResult = $this->stayService->checkout(
            (int) $stay['id'],
            self::HOTEL_ID,
            'card',
            null,
            1,
            $balance,
            $checkOut
        );

        $invoice = $checkoutResult['invoice'];
        $this->assertNotNull($invoice);
        $this->assertEqualsWithDelta(16000.00, (float) $invoice['room_amount'], 0.01);
        $this->assertSame(0.18, (float) $invoice['gst_rate']);
        $this->assertEqualsWithDelta(2880.00, (float) $invoice['room_gst_amount'], 0.01);
        $this->assertEqualsWithDelta(140.00, (float) $invoice['extras_gst_amount'], 0.01);
        $this->assertEqualsWithDelta(20520.00, (float) $invoice['total_amount'], 0.01);

        // Intra-state supply: Hotel '33', Guest default '33'
        // Total GST = 2880 + 140 = 3020 -> CGST: 1510, SGST: 1510, IGST: 0
        $this->assertEqualsWithDelta(1510.00, (float) $invoice['cgst_amount'], 0.01);
        $this->assertEqualsWithDelta(1510.00, (float) $invoice['sgst_amount'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) ($invoice['igst_amount'] ?? 0), 0.01);

        // 6. Test Inter-State Guest GSTIN update (e.g. Karnataka '29')
        $cleanGstin = '29ABCDE1234F1Z5';
        $hotel = $this->hotelRepo->find(self::HOTEL_ID);
        $totalTax = (float) $invoice['room_gst_amount'] + (float) $invoice['extras_gst_amount'];
        $interStateBreakup = $this->gstService->calculateTaxBreakup($totalTax, $hotel['gstin'] ?? null, $cleanGstin);
        $this->invoiceRepo->updateGstin(
            (int) $invoice['id'],
            $cleanGstin,
            $interStateBreakup['cgst_amount'],
            $interStateBreakup['sgst_amount'],
            $interStateBreakup['igst_amount']
        );
        $updatedInv = $this->invoiceRepo->find((int) $invoice['id']);
        $this->assertEqualsWithDelta(0.00, (float) $updatedInv['cgst_amount'], 0.01);
        $this->assertEqualsWithDelta(0.00, (float) $updatedInv['sgst_amount'], 0.01);
        $this->assertEqualsWithDelta(3020.00, (float) $updatedInv['igst_amount'], 0.01);
        $this->assertEqualsWithDelta(20520.00, (float) $updatedInv['total_amount'], 0.01); // Total is strictly protected
    }

    /**
     * Requirement 8 & 10.10: Existing Booking and Invoice Protection
     * Modifying GST settings in the database must NEVER alter historical invoice amounts.
     */
    public function testHistoricalInvoicesAreProtectedAgainstSettingsChanges(): void
    {
        // 1. Direct check-in at 2,000/night (5% GST = 100)
        $today = date('Y-m-d');
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->roomIdStd,
            '9840998877',
            'Historic Guest',
            'Aadhaar',
            '987654321012',
            'Chennai',
            1,
            1,
            2000.00,
            2100.00,
            'upi',
            1
        );

        $checkoutResult = $this->stayService->checkout(
            (int) $stay['id'],
            self::HOTEL_ID,
            'upi',
            null,
            1,
            0.0,
            $today
        );
        $invoice = $checkoutResult['invoice'];
        $invId = (int) $invoice['id'];
        $this->assertEqualsWithDelta(2100.00, (float) $invoice['total_amount'], 0.01);
        $this->assertSame(0.05, (float) $invoice['gst_rate']);
        $this->assertEqualsWithDelta(100.00, (float) $invoice['room_gst_amount'], 0.01);

        // 2. Change GST Settings dramatically: Slab 1 to 12%, Slab 2 to 28%, threshold to 3000
        $this->settingsRepo->update(self::HOTEL_ID, [
            'gst_slab1_max_rate' => 3000.00,
            'gst_slab1_gst_rate' => 0.12,
            'gst_slab2_gst_rate' => 0.28,
        ]);

        // 3. Reload historical invoice from database
        $reloaded = $this->invoiceRepo->find($invId);
        $this->assertNotNull($reloaded);
        $this->assertEqualsWithDelta(2100.00, (float) $reloaded['total_amount'], 0.01, 'Historical total must not change');
        $this->assertSame(0.05, (float) $reloaded['gst_rate'], 'Historical GST rate must not change');
        $this->assertEqualsWithDelta(100.00, (float) $reloaded['room_gst_amount'], 0.01, 'Historical room GST amount must not change');
    }

    /**
     * Requirement 7 & 10.11: GST Settings Persistence
     */
    public function testGstSettingsPersistenceAndRetrieval(): void
    {
        $this->settingsRepo->update(self::HOTEL_ID, [
            'gst_slab1_max_rate' => 7500.00,
            'gst_slab1_gst_rate' => 0.0500,
            'gst_slab2_max_rate' => 7500.00,
            'gst_slab2_gst_rate' => 0.1800,
            'gst_slab3_gst_rate' => 0.1800,
            'tax_extras' => 1,
            'extra_food_gst_rate' => 0.0500,
            'extra_laundry_gst_rate' => 0.1800,
            'extra_bed_gst_rate' => 0.0500,
            'extra_taxi_gst_rate' => 0.0500,
            'extra_other_gst_rate' => 0.1800,
        ]);

        $saved = $this->settingsRepo->find(self::HOTEL_ID);
        $this->assertNotNull($saved);
        $this->assertEqualsWithDelta(7500.00, (float) $saved['gst_slab1_max_rate'], 0.01);
        $this->assertEqualsWithDelta(0.05, (float) $saved['gst_slab1_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.18, (float) $saved['gst_slab2_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.05, (float) $saved['extra_food_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.18, (float) $saved['extra_laundry_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.05, (float) $saved['extra_bed_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.05, (float) $saved['extra_taxi_gst_rate'], 0.0001);
        $this->assertEqualsWithDelta(0.18, (float) $saved['extra_other_gst_rate'], 0.0001);
    }
}
