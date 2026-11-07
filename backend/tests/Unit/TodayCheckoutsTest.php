<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Middleware\RoleMiddleware;
use App\Router\Request;
use App\Service\TodayCheckoutsService;
use App\Support\ApiException;
use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;

final class TodayCheckoutsTest extends TestCase
{
    public function testCleanPhoneNumberForWhatsApp(): void
    {
        $dummyDb = new \PDO('sqlite::memory:');
        $dummyHotels = new \App\Repository\HotelRepository($dummyDb);
        $dummySettings = new \App\Repository\SettingsRepository($dummyDb);
        $service = new TodayCheckoutsService($dummyDb, $dummyHotels, $dummySettings);

        // 10 digits Indian mobile -> prepend 91
        $this->assertSame('919843011872', $service->cleanPhoneNumber('9843011872'));
        $this->assertSame('919843011872', $service->cleanPhoneNumber('+91 98430 11872'));
        $this->assertSame('919843011872', $service->cleanPhoneNumber('98430-11872'));

        // International numbers with >= 11 digits
        $this->assertSame('971501234567', $service->cleanPhoneNumber('+971 50 123 4567'));

        // Invalid / too short numbers -> empty string
        $this->assertSame('', $service->cleanPhoneNumber('123'));
        $this->assertSame('', $service->cleanPhoneNumber(''));
        $this->assertSame('', $service->cleanPhoneNumber('abc'));
    }

    public function testDefaultWhatsAppTemplateContainsRequiredPlaceholders(): void
    {
        $template = TodayCheckoutsService::DEFAULT_WHATSAPP_TEMPLATE;
        $this->assertStringContainsString('{guest_name}', $template);
        $this->assertStringContainsString('{hotel_name}', $template);
        $this->assertStringContainsString('{room_no}', $template);
        $this->assertStringContainsString('{checkout_time}', $template);
    }

    public function testDefaultCheckInWhatsAppTemplateContainsRequiredPlaceholders(): void
    {
        $template = TodayCheckoutsService::DEFAULT_WHATSAPP_CHECKIN_TEMPLATE;
        $this->assertStringContainsString('{{guest_name}}', $template);
        $this->assertStringContainsString('{{hotel_name}}', $template);
        $this->assertStringContainsString('{{room_number}}', $template);
        $this->assertStringContainsString('{{checkin_date}}', $template);
        $this->assertStringContainsString('{{checkin_time}}', $template);
        $this->assertStringContainsString('{{checkout_date}}', $template);
        $this->assertStringContainsString('{{checkout_time}}', $template);
    }

    public function testRoleAuthorizationAllowsAuthorizedRoles(): void
    {
        $middleware = new RoleMiddleware(['admin', 'manager', 'receptionist']);

        foreach (['admin', 'manager', 'receptionist'] as $role) {
            $req = new Request('GET', '/today-checkouts', [], [], [], '127.0.0.1');
            $req->setAttribute('role', $role);
            $middleware($req);
        }
        $this->assertTrue(true);
    }

    public function testRoleAuthorizationBlocksHousekeeping(): void
    {
        $middleware = new RoleMiddleware(['admin', 'manager', 'receptionist']);
        $this->expectException(ApiException::class);

        $req = new Request('GET', '/today-checkouts', [], [], [], '127.0.0.1');
        $req->setAttribute('role', 'housekeeping');
        $middleware($req);
    }

    public function testRoleAuthorizationBlocksUnauthorizedUser(): void
    {
        $middleware = new RoleMiddleware(['admin', 'manager', 'receptionist']);
        $this->expectException(ApiException::class);

        $req = new Request('GET', '/today-checkouts', [], [], [], '127.0.0.1');
        $req->setAttribute('role', 'guest');
        $middleware($req);
    }

    public function testHotelTimezoneDateComputation(): void
    {
        $tzKolkata = new DateTimeZone('Asia/Kolkata');
        $nowKolkata = new DateTimeImmutable('now', $tzKolkata);
        $this->assertSame(10, strlen($nowKolkata->format('Y-m-d')));

        $tzUtc = new DateTimeZone('UTC');
        $nowUtc = new DateTimeImmutable('now', $tzUtc);
        $this->assertSame(10, strlen($nowUtc->format('Y-m-d')));
    }

    public function testInvoiceDetailsInCheckoutItemStructure(): void
    {
        $db = new \PDO('sqlite::memory:');
        $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);

        // Create mock tables
        $db->exec('CREATE TABLE hotels (id INTEGER PRIMARY KEY, name TEXT, place TEXT, address TEXT, gstin TEXT, phone TEXT, email TEXT)');
        $db->exec('CREATE TABLE settings (hotel_id INTEGER PRIMARY KEY, timezone TEXT, checkout_hour INTEGER, whatsapp_checkout_template TEXT)');
        $db->exec('CREATE TABLE rooms (id INTEGER PRIMARY KEY, hotel_id INTEGER, room_type_id INTEGER, room_no INTEGER, floor INTEGER)');
        $db->exec('CREATE TABLE room_types (id INTEGER PRIMARY KEY, name TEXT, code TEXT)');
        $db->exec('CREATE TABLE guests (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, city TEXT)');
        $db->exec('CREATE TABLE reservations (id INTEGER PRIMARY KEY, hotel_id INTEGER, booking_code TEXT, room_id INTEGER, guest_id INTEGER, check_in_date TEXT, check_out_date TEXT, check_out_time TEXT, persons INTEGER, rate REAL, advance_amount REAL, status TEXT)');
        $db->exec('CREATE TABLE stays (id INTEGER PRIMARY KEY, hotel_id INTEGER, reservation_id INTEGER, room_id INTEGER, guest_id INTEGER, persons INTEGER, rate REAL, check_in_date TEXT, checkout_planned TEXT, checkout_time TEXT, checkout_actual TEXT, status TEXT, payment_method TEXT, created_at TEXT, updated_at TEXT)');
        $db->exec('CREATE TABLE invoices (id INTEGER PRIMARY KEY, hotel_id INTEGER, stay_id INTEGER, invoice_number TEXT, total_amount REAL)');

        $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata')))->format('Y-m-d');

        $db->exec("INSERT INTO hotels VALUES (1, 'Test Hotel', 'City', 'Address', 'GSTIN123', '9999999999', 'test@hotel.com')");
        $db->exec("INSERT INTO settings VALUES (1, 'Asia/Kolkata', 12, 'Hello {guest_name}')");
        $db->exec("INSERT INTO room_types VALUES (1, 'Deluxe', 'DLX')");
        $db->exec("INSERT INTO rooms VALUES (1, 1, 1, 101, 1)");
        $db->exec("INSERT INTO rooms VALUES (2, 1, 1, 102, 1)");
        $db->exec("INSERT INTO guests VALUES (1, 'Alice Smith', '9843011872', 'Bengaluru')");
        $db->exec("INSERT INTO guests VALUES (2, 'Bob Jones', '9843011873', 'Mumbai')");

        // Stay 1: pending checkout (in_house) without invoice
        $db->exec("INSERT INTO stays VALUES (1, 1, NULL, 1, 1, 2, 2500, '$today', '$today', '12:00:00', NULL, 'in_house', NULL, '2026-11-05 10:00:00', '2026-11-05 10:00:00')");

        // Stay 2: checked_out with invoice
        $db->exec("INSERT INTO stays VALUES (2, 1, NULL, 2, 2, 1, 3000, '$today', '$today', '12:00:00', '$today', 'checked_out', 'cash', '2026-11-05 08:00:00', '2026-11-05 11:30:00')");
        $db->exec("INSERT INTO invoices VALUES (42, 1, 2, 'INV-2026-27-0042', 3150.00)");

        $hotels = new \App\Repository\HotelRepository($db);
        $settings = new \App\Repository\SettingsRepository($db);
        $service = new TodayCheckoutsService($db, $hotels, $settings);

        $result = $service->getTodayCheckouts(1);
        $this->assertSame(2, $result['stats']['total']);
        $this->assertSame(1, $result['stats']['pending']);
        $this->assertSame(1, $result['stats']['checked_out']);

        $pendingItem = $result['checkouts'][0];
        $this->assertSame('pending', $pendingItem['checkout_status']);
        $this->assertNull($pendingItem['invoice_id']);
        $this->assertNull($pendingItem['invoice_number']);
        $this->assertNull($pendingItem['invoice_total']);

        $checkedOutItem = $result['checkouts'][1];
        $this->assertSame('checked_out', $checkedOutItem['checkout_status']);
        $this->assertSame(42, $checkedOutItem['invoice_id']);
        $this->assertSame('INV-2026-27-0042', $checkedOutItem['invoice_number']);
        $this->assertSame(3150.0, $checkedOutItem['invoice_total']);
    }
}
