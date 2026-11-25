<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\RoleRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Repository\SettingsRepository;
use App\Repository\UserRepository;
use App\Service\GuestService;
use App\Service\RoomService;
use App\Service\UserService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class DeleteFunctionalityTest extends TestCase
{
    private PDO $db;
    private GuestRepository $guestRepo;
    private UserRepository $userRepo;
    private RoleRepository $roleRepo;
    private AuditLogger $audit;

    protected function setUp(): void
    {
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $this->db->exec('
            CREATE TABLE roles (id INTEGER PRIMARY KEY, code TEXT, name TEXT);
            CREATE TABLE users (id INTEGER PRIMARY KEY, hotel_id INTEGER, role_id INTEGER, name TEXT, username TEXT, email TEXT, phone TEXT, password_hash TEXT, is_active INTEGER, last_login_at TEXT);
            CREATE TABLE guests (id INTEGER PRIMARY KEY, hotel_id INTEGER, name TEXT, phone TEXT, email TEXT, id_proof_type TEXT, id_proof_number_enc BLOB, id_proof_last4 TEXT, city TEXT, address TEXT, is_foreign INTEGER, nationality TEXT, visa_expiry TEXT, id_image_path TEXT);
            CREATE TABLE reservations (id INTEGER PRIMARY KEY, hotel_id INTEGER, booking_code TEXT, guest_id INTEGER, room_id INTEGER, check_in_date TEXT, referred_by_guest_id INTEGER, created_by INTEGER, cancelled_by INTEGER, status TEXT);
            CREATE TABLE stays (id INTEGER PRIMARY KEY, hotel_id INTEGER, guest_id INTEGER, room_id INTEGER, referred_by_guest_id INTEGER, created_by INTEGER, status TEXT);
            CREATE TABLE payments (id INTEGER PRIMARY KEY, hotel_id INTEGER, guest_id INTEGER, reservation_id INTEGER, stay_id INTEGER, received_by INTEGER, amount REAL, status TEXT);
            CREATE TABLE invoices (id INTEGER PRIMARY KEY, hotel_id INTEGER, stay_id INTEGER, invoice_number TEXT, total_amount REAL);
            CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, hotel_id INTEGER, user_id INTEGER, action TEXT, entity_type TEXT, entity_id INTEGER, before_json TEXT, after_json TEXT, ip_address TEXT, created_at TEXT);
            CREATE TABLE refresh_tokens (id INTEGER PRIMARY KEY, user_id INTEGER, token_hash TEXT, expires_at TEXT, revoked_at TEXT, created_at TEXT);
            CREATE TABLE occupants (id INTEGER PRIMARY KEY, hotel_id INTEGER, stay_id INTEGER, occupant_number INTEGER, name TEXT, gender TEXT, phone TEXT, is_primary INTEGER, guest_id INTEGER);
            CREATE TABLE occupant_documents (id INTEGER PRIMARY KEY, occupant_id INTEGER, file_name TEXT);
            CREATE TABLE room_types (id INTEGER PRIMARY KEY, hotel_id INTEGER, code TEXT, name TEXT, rate REAL, max_persons INTEGER);
            CREATE TABLE rooms (id INTEGER PRIMARY KEY, hotel_id INTEGER, room_no INTEGER, floor INTEGER, room_type_id INTEGER, housekeeping_status TEXT, housekeeping_note TEXT, note TEXT);
            CREATE TABLE stay_charges (id INTEGER PRIMARY KEY, stay_id INTEGER, label TEXT, amount REAL, is_taxable INTEGER, added_by INTEGER, tax_category TEXT, sac_code TEXT, gst_rate REAL, gst_amount REAL);
            CREATE TABLE housekeeping_logs (id INTEGER PRIMARY KEY, room_id INTEGER, action TEXT, note TEXT, changed_by INTEGER, created_at TEXT);
        ');

        $this->db->exec("
            INSERT INTO roles (id, code, name) VALUES (1, 'admin', 'Administrator'), (2, 'receptionist', 'Receptionist');
        ");

        $this->guestRepo = new GuestRepository($this->db);
        $this->userRepo = new UserRepository($this->db);
        $this->roleRepo = new RoleRepository($this->db);
        $this->audit = new AuditLogger(new AuditLogRepository($this->db));
    }

    public function testGuestDeleteRejectsNonExistentGuest(): void
    {
        $service = new GuestService($this->guestRepo, null, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Guest not found.');
        $service->delete(hotelId: 1, guestId: 999, userId: 1);
    }

    public function testGuestDeleteRejectsGuestFromDifferentHotel(): void
    {
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (10, 2, 'Jane Other Hotel', '9876543210', 'Aadhaar')
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Guest not found.');
        $service->delete(hotelId: 1, guestId: 10, userId: 1);
    }

    public function testGuestDeleteSucceedsWhenNoHistoricalRecords(): void
    {
        // Scenario 1: Guest without bookings
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (12, 1, 'Orphan Guest', '9876543212', 'Aadhaar')
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);
        $service->delete(hotelId: 1, guestId: 12, userId: 1);

        $this->assertNull($this->guestRepo->find(12));

        // Audit log was created
        $stmt = $this->db->query("SELECT * FROM audit_logs WHERE action = 'guest_delete' AND entity_id = 12");
        $log = $stmt->fetch();
        $this->assertNotFalse($log);
        $this->assertSame('guest', $log['entity_type']);
    }

    public function testGuestDeleteRejectsFuturePendingBookingWithCancelInstruction(): void
    {
        // Scenario 2: Guest with one future pending booking
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (21, 1, 'Pending Guest', '9876543221', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (201, 1, 301, 3, 1, 'ok');
            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, status)
            VALUES (201, 1, 'BK-1001', 21, 201, '2026-12-01', 'pending');
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        try {
            $service->delete(hotelId: 1, guestId: 21, userId: 1);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertSame('active_booking', $e->getErrorCode());
            $this->assertStringContainsString('Cannot delete guest: guest has a future booking (BK-1001). The booking must be cancelled first.', $e->getMessage());
            $fields = $e->getFields();
            $this->assertNotNull($fields);
            $this->assertSame('201', $fields['bookingId']);
            $this->assertSame('BK-1001', $fields['bookingCode']);
        }

        // Reservation was NOT automatically deleted
        $res = $this->db->query("SELECT * FROM reservations WHERE id = 201")->fetch();
        $this->assertNotFalse($res);
        $this->assertSame('pending', $res['status']);
    }

    public function testGuestDeleteSucceedsAfterBookingCancellationWithoutFinancialRecords(): void
    {
        // Scenario 3: Guest with a cancelled booking (no payments, no stays, no invoices)
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (22, 1, 'Cancelled Booking Guest', '9876543222', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (202, 1, 302, 3, 1, 'ok');
            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, status)
            VALUES (202, 1, 'BK-1002', 22, 202, '2026-12-02', 'cancelled');
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);
        $service->delete(hotelId: 1, guestId: 22, userId: 1);

        $this->assertNull($this->guestRepo->find(22));
    }

    public function testGuestDeleteRejectsActiveStay(): void
    {
        // Scenario 4: Guest with an active stay
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (23, 1, 'In House Guest', '9876543223', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (203, 1, 303, 3, 1, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status)
            VALUES (301, 1, 23, 203, 'in_house');
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        try {
            $service->delete(hotelId: 1, guestId: 23, userId: 1);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertSame('active_stay', $e->getErrorCode());
            $this->assertStringContainsString('Cannot delete guest: guest has an active stay in Room 303. Checkout must be completed first.', $e->getMessage());
        }

        // Active stay was NOT deleted
        $stay = $this->db->query("SELECT * FROM stays WHERE id = 301")->fetch();
        $this->assertNotFalse($stay);
        $this->assertSame('in_house', $stay['status']);
    }

    public function testGuestDeleteRejectsCompletedStayHistory(): void
    {
        // Scenario 5: Guest with a completed stay
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (24, 1, 'Checked Out Guest', '9876543224', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (204, 1, 304, 3, 1, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status)
            VALUES (302, 1, 24, 204, 'checked_out');
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        try {
            $service->delete(hotelId: 1, guestId: 24, userId: 1);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertSame('completed_stay', $e->getErrorCode());
            $this->assertSame('Cannot delete guest: guest has completed stay history.', $e->getMessage());
        }

        // Completed stay history was NOT deleted
        $stay = $this->db->query("SELECT * FROM stays WHERE id = 302")->fetch();
        $this->assertNotFalse($stay);
    }

    public function testGuestDeleteRejectsGuestWithInvoiceRecords(): void
    {
        // Scenario 6a: Guest with billing or invoice records
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (25, 1, 'Invoice Guest', '9876543225', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (205, 1, 305, 3, 1, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status)
            VALUES (303, 1, 25, 205, 'cancelled');
            INSERT INTO invoices (id, hotel_id, stay_id, invoice_number, total_amount)
            VALUES (401, 1, 303, 'INV-2026-001', 2500);
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        try {
            $service->delete(hotelId: 1, guestId: 25, userId: 1);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertSame('has_invoices', $e->getErrorCode());
            $this->assertSame('Cannot delete guest: guest has billing or invoice records.', $e->getMessage());
        }

        // Invoice was NOT deleted
        $inv = $this->db->query("SELECT * FROM invoices WHERE id = 401")->fetch();
        $this->assertNotFalse($inv);
    }

    public function testGuestDeleteRejectsGuestWithPaymentRecords(): void
    {
        // Scenario 6b: Guest with payment records on reservation
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (26, 1, 'Payment Guest', '9876543226', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (206, 1, 306, 3, 1, 'ok');
            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, status)
            VALUES (206, 1, 'BK-1006', 26, 206, '2026-12-06', 'cancelled');
            INSERT INTO payments (id, hotel_id, reservation_id, amount, status)
            VALUES (501, 1, 206, 500, 'successful');
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        try {
            $service->delete(hotelId: 1, guestId: 26, userId: 1);
            $this->fail('Expected ApiException to be thrown');
        } catch (ApiException $e) {
            $this->assertSame(409, $e->getStatus());
            $this->assertSame('has_payments', $e->getErrorCode());
            $this->assertSame('Cannot delete guest: guest has payment or refund records.', $e->getMessage());
        }

        // Payment was NOT deleted
        $payment = $this->db->query("SELECT * FROM payments WHERE id = 501")->fetch();
        $this->assertNotFalse($payment);
    }

    public function testUserDeleteRejectsDeletingOwnAccount(): void
    {
        $service = new UserService($this->userRepo, $this->roleRepo, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('You cannot delete your own account.');
        $service->delete(id: 1, hotelId: 1, actingUserId: 1);
    }

    public function testUserDeleteRejectsNonExistentUser(): void
    {
        $service = new UserService($this->userRepo, $this->roleRepo, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('User not found.');
        $service->delete(id: 999, hotelId: 1, actingUserId: 1);
    }

    public function testUserDeleteRejectsLastActiveAdmin(): void
    {
        $this->db->exec("
            INSERT INTO users (id, hotel_id, role_id, name, username, password_hash, is_active)
            VALUES (2, 1, 1, 'Sole Admin', 'soleadmin', 'hash', 1)
        ");

        $service = new UserService($this->userRepo, $this->roleRepo, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Cannot delete the last active administrator.');
        $service->delete(id: 2, hotelId: 1, actingUserId: 99);
    }

    public function testUserDeleteRejectsUserWithOperationalOrAuditHistory(): void
    {
        // Add 2 admins so last admin check passes
        $this->db->exec("
            INSERT INTO users (id, hotel_id, role_id, name, username, password_hash, is_active)
            VALUES (2, 1, 1, 'Admin 1', 'admin1', 'hash', 1),
                   (3, 1, 2, 'Receptionist 1', 'rec1', 'hash', 1)
        ");
        $this->db->exec("
            INSERT INTO audit_logs (hotel_id, user_id, action, entity_type, entity_id)
            VALUES (1, 3, 'room_update', 'room', 101)
        ");

        $service = new UserService($this->userRepo, $this->roleRepo, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Cannot permanently delete user: account has operational or audit history. Deactivate the account instead.');
        $service->delete(id: 3, hotelId: 1, actingUserId: 2);
    }

    public function testUserDeleteSucceedsWhenNoHistory(): void
    {
        $this->db->exec("
            INSERT INTO users (id, hotel_id, role_id, name, username, password_hash, is_active)
            VALUES (2, 1, 1, 'Admin 1', 'admin1', 'hash', 1),
                   (4, 1, 2, 'New Receptionist', 'newrec', 'hash', 1)
        ");

        $service = new UserService($this->userRepo, $this->roleRepo, $this->audit);
        $service->delete(id: 4, hotelId: 1, actingUserId: 2);

        $this->assertNull($this->userRepo->findById(4));

        // Audit log was created
        $stmt = $this->db->query("SELECT * FROM audit_logs WHERE action = 'user_delete' AND entity_id = 4");
        $log = $stmt->fetch();
        $this->assertNotFalse($log);
        $this->assertSame('user', $log['entity_type']);
    }

    public function testGuestDeleteRejectsGuestLinkedToOccupant(): void
    {
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type)
            VALUES (13, 1, 'Occupant Guest', '9876543213', 'Aadhaar');
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status)
            VALUES (207, 1, 307, 3, 1, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status)
            VALUES (201, 1, 99, 207, 'in_house');
            INSERT INTO occupants (id, hotel_id, stay_id, occupant_number, guest_id)
            VALUES (501, 1, 201, 2, 13);
        ");

        $service = new GuestService($this->guestRepo, null, $this->audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Cannot delete guest: guest has an active stay in Room 307. Checkout must be completed first.');
        $service->delete(hotelId: 1, guestId: 13, userId: 1);
    }

    public function testGuestIdImageDeleteClearsFieldAndLogsAudit(): void
    {
        $this->db->exec("
            INSERT INTO guests (id, hotel_id, name, phone, id_proof_type, id_image_path)
            VALUES (14, 1, 'Photo Guest', '9876543214', 'Aadhaar', 'guests/14-fake.jpg')
        ");

        $tmpDir = sys_get_temp_dir() . '/test_uploads_' . bin2hex(random_bytes(4));
        mkdir($tmpDir . '/guests', 0777, true);
        $filePath = $tmpDir . '/guests/14-fake.jpg';
        file_put_contents($filePath, 'fake image data');

        $uploader = new IdImageUploader($tmpDir);
        $service = new GuestService($this->guestRepo, $uploader, $this->audit);

        $this->assertFileExists($filePath);
        $updated = $service->deleteIdImage(hotelId: 1, guestId: 14, userId: 1);

        $this->assertNull($updated['id_image_path']);
        $this->assertFileDoesNotExist($filePath);

        $stmt = $this->db->query("SELECT * FROM audit_logs WHERE action = 'guest_id_image_delete' AND entity_id = 14");
        $log = $stmt->fetch();
        $this->assertNotFalse($log);

        @rmdir($tmpDir . '/guests');
        @rmdir($tmpDir);
    }

    public function testRoomDeleteRejectsActiveStay(): void
    {
        $this->db->exec("
            INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (1, 1, 'STD', 'Standard', 1500, 2);
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (101, 1, 101, 1, 1, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status) VALUES (1, 1, 1, 101, 'in_house');
        ");

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $this->audit, $settingsRepo);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 101 has a guest or booking. It cannot be removed.');
        $roomService->deleteRoom(101, 1, 1);
    }

    public function testRoomDeleteRejectsHistoricalStays(): void
    {
        $this->db->exec("
            INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (2, 1, 'DLX', 'Deluxe', 2500, 2);
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (102, 1, 102, 1, 2, 'ok');
            INSERT INTO stays (id, hotel_id, guest_id, room_id, status) VALUES (2, 1, 1, 102, 'checked_out');
        ");

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $this->audit, $settingsRepo);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 102 has historical stays or bookings. It cannot be removed.');
        $roomService->deleteRoom(102, 1, 1);
    }

    public function testRoomDeleteSucceedsWhenNoReferences(): void
    {
        $this->db->exec("
            INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (3, 1, 'SUI', 'Suite', 4500, 4);
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (103, 1, 103, 1, 3, 'ok');
        ");

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $this->audit, $settingsRepo);

        $roomService->deleteRoom(103, 1, 1);
        $this->assertNull($roomRepo->find(103));

        $stmt = $this->db->query("SELECT * FROM audit_logs WHERE action = 'room_delete' AND entity_id = 103");
        $log = $stmt->fetch();
        $this->assertNotFalse($log);
    }

    public function testRoomTypeDeleteRejectsWhenRoomsAssigned(): void
    {
        $this->db->exec("
            INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (4, 1, 'PRE', 'Premium', 3500, 3);
            INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (104, 1, 104, 1, 4, 'ok');
        ");

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $this->audit, $settingsRepo);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Change the type of its rooms first.');
        $roomService->deleteRoomType(4, 1);
    }

    public function testRoomTypeDeleteSucceedsWhenNoRooms(): void
    {
        $this->db->exec("
            INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (5, 1, 'EXE', 'Executive', 5000, 2);
        ");

        $roomRepo = new RoomRepository($this->db);
        $roomTypeRepo = new RoomTypeRepository($this->db);
        $hkRepo = new HousekeepingLogRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $this->audit, $settingsRepo);

        $roomService->deleteRoomType(5, 1);
        $this->assertNull($roomTypeRepo->find(5));
    }
}
