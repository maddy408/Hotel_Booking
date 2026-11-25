<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Controller\InvoiceController;
use App\Repository\HotelRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\BillingService;
use App\Service\GstService;
use App\Support\ApiException;
use PDO;
use PHPUnit\Framework\TestCase;

final class InvoiceControllerTest extends TestCase
{
    private PDO $db;
    private InvoiceRepository $invoices;
    private StayRepository $stays;
    private StayChargeRepository $charges;
    private HotelRepository $hotels;
    private PaymentRepository $payments;
    private SettingsRepository $settings;
    private BillingService $billing;
    private InvoiceController $controller;

    protected function setUp(): void
    {
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $this->db->exec('CREATE TABLE hotels (id INTEGER PRIMARY KEY, name TEXT, place TEXT, address TEXT, gstin TEXT, phone TEXT, email TEXT)');
        $this->db->exec('CREATE TABLE settings (hotel_id INTEGER PRIMARY KEY, gst_slab1_rate REAL, gst_slab2_rate REAL, gst_slab1_threshold REAL, invoice_prefix TEXT, financial_year_start_month INTEGER, early_checkout_refund_unused_nights INTEGER, early_checkout_fee_type TEXT, early_checkout_fee_value REAL)');
        $this->db->exec('CREATE TABLE room_types (id INTEGER PRIMARY KEY, name TEXT, code TEXT)');
        $this->db->exec('CREATE TABLE rooms (id INTEGER PRIMARY KEY, hotel_id INTEGER, room_type_id INTEGER, room_no TEXT, floor INTEGER)');
        $this->db->exec('CREATE TABLE guests (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, email TEXT, city TEXT, address TEXT, id_proof_type TEXT, id_proof_last4 TEXT)');
        $this->db->exec('CREATE TABLE reservations (id INTEGER PRIMARY KEY, check_in_date TEXT, check_out_date TEXT)');
        $this->db->exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
        $this->db->exec('CREATE TABLE stays (
            id INTEGER PRIMARY KEY,
            hotel_id INTEGER,
            reservation_id INTEGER,
            room_id INTEGER,
            guest_id INTEGER,
            referred_by_guest_id INTEGER,
            persons INTEGER,
            rate REAL,
            check_in_date TEXT,
            checkout_planned TEXT,
            checkout_time TEXT,
            checkout_actual TEXT,
            status TEXT,
            guest_gstin TEXT,
            gst_rate REAL,
            discount_amount REAL,
            early_checkout_fee REAL,
            payment_method TEXT,
            created_at TEXT,
            updated_at TEXT
        )');
        $this->db->exec('CREATE TABLE stay_charges (
            id INTEGER PRIMARY KEY,
            stay_id INTEGER,
            label TEXT,
            amount REAL,
            sac_code TEXT,
            gst_rate REAL,
            gst_amount REAL,
            is_taxable INTEGER,
            type TEXT,
            created_at TEXT
        )');
        $this->db->exec('CREATE TABLE payments (
            id INTEGER PRIMARY KEY,
            hotel_id INTEGER,
            stay_id INTEGER,
            reservation_id INTEGER,
            amount REAL,
            type TEXT,
            method TEXT,
            status TEXT,
            reference TEXT,
            received_by INTEGER,
            created_at TEXT
        )');
        $this->db->exec('CREATE TABLE invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hotel_id INTEGER,
            stay_id INTEGER,
            invoice_number TEXT,
            financial_year TEXT,
            sequence_no INTEGER,
            guest_gstin TEXT,
            room_amount REAL,
            gst_rate REAL,
            room_gst_amount REAL,
            extras_amount REAL,
            extras_gst_amount REAL,
            cgst_amount REAL,
            sgst_amount REAL,
            igst_amount REAL,
            total_amount REAL,
            advance_paid REAL,
            balance_amount REAL,
            discount_amount REAL,
            early_checkout_fee REAL,
            refund_amount REAL,
            created_at TEXT
        )');

        $this->db->exec("INSERT INTO hotels VALUES (1, 'KKK Lodge', 'Puducherry', '123 Heritage Lane', '33AAAAA0000A1Z5', '9989015824', 'hotel@example.com')");
        $this->db->exec("INSERT INTO settings VALUES (1, 0.05, 0.18, 7500.0, 'TC', 4, 1, 'none', 0.0)");
        $this->db->exec("INSERT INTO room_types VALUES (1, 'Deluxe Room', 'DEL')");
        $this->db->exec("INSERT INTO rooms VALUES (1, 1, 1, '301', 3)");
        $this->db->exec("INSERT INTO guests VALUES (1, 'Ananya Raooo', '9989015824', 'ananya@example.com', 'Chennai', '45 Beach Rd', 'Aadhaar', '5824')");

        $this->invoices = new InvoiceRepository($this->db);
        $this->stays = new StayRepository($this->db);
        $this->charges = new StayChargeRepository($this->db);
        $this->hotels = new HotelRepository($this->db);
        $this->payments = new PaymentRepository($this->db);
        $this->settings = new SettingsRepository($this->db);

        $gstService = new GstService($this->settings);
        $this->billing = new BillingService(
            $gstService,
            $this->charges,
            $this->payments,
            $this->settings,
            $this->hotels
        );

        $this->controller = new InvoiceController(
            $this->invoices,
            $this->stays,
            $this->charges,
            $this->hotels,
            $this->payments,
            $this->billing,
            $this->settings
        );
    }

    public function testByStayReturnsProformaInvoiceForInHouseStay(): void
    {
        // Stay #14: Room 301, in_house, 9 Nov to 14 Nov (5 nights @ 2200 = 11000 + 5% GST 550 = 11550)
        $this->db->exec("INSERT INTO stays (id, hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status, gst_rate)
            VALUES (14, 1, 1, 1, 1, 2200.0, '2026-11-09', '2026-11-14', 'in_house', 0.05)");

        // 1000 Advance payment
        $this->db->exec("INSERT INTO payments (id, hotel_id, stay_id, amount, type, method, status, created_at)
            VALUES (1, 1, 14, 1000.0, 'advance', 'upi', 'successful', '2026-11-09 10:00:00')");

        $request = new Request('GET', '/stays/14/invoice', [], [], [], '127.0.0.1');
        $request->routeParams = ['stayId' => '14'];
        $request->setAttribute('hotelId', 1);

        $result = $this->controller->byStay($request);

        $this->assertArrayHasKey('invoice', $result);
        $this->assertArrayHasKey('hotel', $result);
        $this->assertArrayHasKey('stay', $result);
        $this->assertArrayHasKey('paymentSummary', $result);

        $this->assertTrue($result['invoice']['is_proforma']);
        $this->assertSame('TC-PROFORMA-0014', $result['invoice']['invoice_number']);
        $this->assertSame('Ananya Raooo', $result['stay']['guest_name']);
        $this->assertSame('301', $result['stay']['room_no']);
        $this->assertEquals(11000.0, $result['invoice']['room_amount']);
        $this->assertEquals(550.0, $result['invoice']['room_gst_amount']);
        $this->assertEquals(11550.0, $result['invoice']['total_amount']);
        $this->assertEquals(1000.0, $result['paymentSummary']['advancePaid']);
        $this->assertEquals(10550.0, $result['paymentSummary']['balance']);
    }

    public function testByStayReturnsSavedInvoiceWhenAvailable(): void
    {
        $this->db->exec("INSERT INTO stays (id, hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, gst_rate)
            VALUES (20, 1, 1, 1, 1, 2200.0, '2026-11-01', '2026-11-03', '2026-11-03', 'checked_out', 0.05)");

        $this->db->exec("INSERT INTO invoices (id, hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, igst_amount, total_amount, advance_paid, balance_amount, created_at)
            VALUES (5, 1, 20, 'TC-2026-27-0005', '2026-27', 5, 4400.0, 0.05, 220.0, 0.0, 0.0, 110.0, 110.0, 0.0, 4620.0, 1000.0, 3620.0, '2026-11-03 11:00:00')");

        $request = new Request('GET', '/stays/20/invoice', [], [], [], '127.0.0.1');
        $request->routeParams = ['stayId' => '20'];
        $request->setAttribute('hotelId', 1);

        $result = $this->controller->byStay($request);

        $this->assertSame('TC-2026-27-0005', $result['invoice']['invoice_number']);
        $this->assertArrayNotHasKey('is_proforma', $result['invoice']);
        $this->assertEquals(4620.0, $result['invoice']['total_amount']);
    }

    public function testByStayThrowsNotFoundWhenStayDoesNotExist(): void
    {
        $request = new Request('GET', '/stays/999/invoice', [], [], [], '127.0.0.1');
        $request->routeParams = ['stayId' => '999'];
        $request->setAttribute('hotelId', 1);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('No invoice for this stay yet.');

        $this->controller->byStay($request);
    }
}
