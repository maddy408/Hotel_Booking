<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Controller\ReportController;
use App\Repository\InvoiceRepository;
use App\Repository\ReportRepository;
use App\Router\Request;
use App\Service\ReportService;
use PDO;
use PHPUnit\Framework\TestCase;

final class ReportDateFilterTest extends TestCase
{
    private PDO $db;
    private ReportRepository $repo;
    private ReportService $service;

    protected function setUp(): void
    {
        // Set up in-memory SQLite PDO for isolated unit test without modifying any real database
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        // Create mock tables matching schema
        $this->db->exec('
            CREATE TABLE stays (
                id INTEGER PRIMARY KEY,
                hotel_id INTEGER,
                room_id INTEGER,
                guest_id INTEGER,
                status TEXT,
                check_in_date TEXT,
                checkout_planned TEXT,
                checkout_actual TEXT
            );
            CREATE TABLE invoices (
                id INTEGER PRIMARY KEY,
                hotel_id INTEGER,
                stay_id INTEGER,
                total_amount REAL,
                room_amount REAL,
                room_gst_amount REAL,
                extras_amount REAL,
                extras_gst_amount REAL,
                created_at TEXT
            );
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY,
                hotel_id INTEGER,
                stay_id INTEGER,
                type TEXT,
                method TEXT,
                amount REAL,
                created_at TEXT
            );
            CREATE TABLE rooms (
                id INTEGER PRIMARY KEY,
                hotel_id INTEGER,
                room_no TEXT
            );
        ');

        // Seed sample test rooms (total 10 rooms)
        for ($i = 1; $i <= 10; $i++) {
            $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no) VALUES ({$i}, 1, '10{$i}')");
        }

        // Seed stays and invoices across several dates
        // Day 1: 2026-11-20 (2 checkouts, total 5000)
        $this->db->exec("INSERT INTO stays (id, hotel_id, room_id, guest_id, status, check_in_date, checkout_planned, checkout_actual)
            VALUES (1, 1, 1, 1, 'checked_out', '2026-11-18', '2026-11-20', '2026-11-20')");
        $this->db->exec("INSERT INTO invoices (id, hotel_id, stay_id, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, created_at)
            VALUES (1, 1, 1, 2500.0, 2200.0, 300.0, 0, 0, '2026-11-20 11:00:00')");

        $this->db->exec("INSERT INTO stays (id, hotel_id, room_id, guest_id, status, check_in_date, checkout_planned, checkout_actual)
            VALUES (2, 1, 2, 2, 'checked_out', '2026-11-19', '2026-11-20', '2026-11-20')");
        $this->db->exec("INSERT INTO invoices (id, hotel_id, stay_id, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, created_at)
            VALUES (2, 1, 2, 2500.0, 2200.0, 300.0, 0, 0, '2026-11-20 11:30:00')");

        // Day 2: 2026-11-21 (1 checkout, total 3500)
        $this->db->exec("INSERT INTO stays (id, hotel_id, room_id, guest_id, status, check_in_date, checkout_planned, checkout_actual)
            VALUES (3, 1, 3, 3, 'checked_out', '2026-11-19', '2026-11-21', '2026-11-21')");
        $this->db->exec("INSERT INTO invoices (id, hotel_id, stay_id, total_amount, room_amount, room_gst_amount, extras_amount, extras_gst_amount, created_at)
            VALUES (3, 1, 3, 3500.0, 3000.0, 500.0, 0, 0, '2026-11-21 10:00:00')");

        // Seed payments
        // 2026-11-20: advance 1000 cash, advance 500 upi
        $this->db->exec("INSERT INTO payments (id, hotel_id, stay_id, type, method, amount, created_at)
            VALUES (1, 1, 1, 'advance', 'cash', 1000.0, '2026-11-20 09:00:00')");
        $this->db->exec("INSERT INTO payments (id, hotel_id, stay_id, type, method, amount, created_at)
            VALUES (2, 1, 2, 'advance', 'upi', 500.0, '2026-11-20 09:30:00')");
        // 2026-11-21: settle 3500 card
        $this->db->exec("INSERT INTO payments (id, hotel_id, stay_id, type, method, amount, created_at)
            VALUES (3, 1, 3, 'settle', 'card', 3500.0, '2026-11-21 10:00:00')");

        $this->repo = new ReportRepository($this->db);
        $invoiceRepo = new InvoiceRepository($this->db);
        $this->service = new ReportService($this->repo, $invoiceRepo);
    }

    public function testCheckoutsInRangeSingleDay(): void
    {
        $res = $this->repo->checkoutsInRange(1, '2026-11-20', '2026-11-20');
        $this->assertSame(2, $res['count']);
        $this->assertEquals(5000.0, $res['total']);

        $res2 = $this->repo->checkoutsInRange(1, '2026-11-21', '2026-11-21');
        $this->assertSame(1, $res2['count']);
        $this->assertEquals(3500.0, $res2['total']);
    }

    public function testCheckoutsInRangeMultiDay(): void
    {
        $res = $this->repo->checkoutsInRange(1, '2026-11-20', '2026-11-21');
        $this->assertSame(3, $res['count']);
        $this->assertEquals(8500.0, $res['total']);
    }

    public function testAdvanceTakenInRange(): void
    {
        $single = $this->repo->advanceTakenInRange(1, '2026-11-20', '2026-11-20');
        $this->assertEquals(1500.0, $single);

        $range = $this->repo->advanceTakenInRange(1, '2026-11-20', '2026-11-21');
        $this->assertEquals(1500.0, $range);

        $empty = $this->repo->advanceTakenInRange(1, '2026-11-22', '2026-11-22');
        $this->assertEquals(0.0, $empty);
    }

    public function testCollectionByMethodInRange(): void
    {
        $rows = $this->repo->collectionByMethodInRange(1, '2026-11-20', '2026-11-21');
        $map = [];
        foreach ($rows as $r) {
            $map[$r['method']] = (float) $r['total'];
        }
        $this->assertEquals(1000.0, $map['cash'] ?? 0.0);
        $this->assertEquals(500.0, $map['upi'] ?? 0.0);
        $this->assertEquals(3500.0, $map['card'] ?? 0.0);
    }

    public function testReportServiceSummarySingleDateAndRange(): void
    {
        // Single date summary
        $single = $this->service->summary(1, '2026-11-20', '2026-11-20');
        $this->assertSame('2026-11-20', $single['date']);
        $this->assertSame(2, $single['checkouts']);
        $this->assertEquals(5000.0, $single['billedAtCheckout']);
        $this->assertEquals(1500.0, $single['advanceTaken']);
        $this->assertSame(10, $single['occupancy']['total']);

        // Multi-day range summary
        $multi = $this->service->summary(1, '2026-11-20', '2026-11-21');
        $this->assertNull($multi['date']);
        $this->assertSame('2026-11-20', $multi['from']);
        $this->assertSame('2026-11-21', $multi['to']);
        $this->assertSame(3, $multi['checkouts']);
        $this->assertEquals(8500.0, $multi['billedAtCheckout']);
        $this->assertEquals(1500.0, $multi['advanceTaken']);
        $this->assertSame(2, $multi['occupancy']['days']);
        $this->assertSame(10, $multi['occupancy']['total']);
    }

    public function testReportServiceDayEndSingleDateAndRange(): void
    {
        $dayEnd = $this->service->dayEnd(1, '2026-11-20', '2026-11-21');
        $this->assertSame('2026-11-20', $dayEnd['from']);
        $this->assertSame('2026-11-21', $dayEnd['to']);
        $this->assertEquals(1000.0, $dayEnd['byMethod']['cash']);
        $this->assertEquals(500.0, $dayEnd['byMethod']['upi']);
        $this->assertEquals(3500.0, $dayEnd['byMethod']['card']);
        $this->assertEquals(5000.0, $dayEnd['total']);
    }

    public function testReportControllerTodayAndDayEndWithQueryParams(): void
    {
        $controller = new ReportController($this->service);

        // Request with from & to query parameters
        $req = new Request('GET', '/reports/today', [
            'from' => '2026-11-20',
            'to' => '2026-11-21',
        ], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);

        $res = $controller->today($req);
        $this->assertSame(3, $res['checkouts']);
        $this->assertEquals(8500.0, $res['billedAtCheckout']);

        // Day end with query params
        $reqDayEnd = new Request('GET', '/reports/day-end', [
            'from' => '2026-11-20',
            'to' => '2026-11-21',
        ], [], [], '127.0.0.1');
        $reqDayEnd->setAttribute('hotelId', 1);

        $resDayEnd = $controller->dayEnd($reqDayEnd);
        $this->assertEquals(5000.0, $resDayEnd['total']);
    }
}
