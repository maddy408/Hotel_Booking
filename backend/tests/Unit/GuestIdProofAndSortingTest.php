<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Repository\GuestRepository;
use App\Repository\ReservationRepository;
use App\Service\GuestService;
use App\Support\Crypto;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestIdProofAndSortingTest extends TestCase
{
    private PDO $db;
    private GuestRepository $guestRepo;
    private GuestService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $_ENV['ENCRYPTION_KEY'] = 'base64:vcgxQwtnZNKr108R8FeoMaeOgAIlZWp1gKshMtM6ljc=';

        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $this->db->exec('
            CREATE TABLE guests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                name TEXT,
                phone TEXT,
                email TEXT,
                id_proof_type TEXT,
                id_proof_number_enc BLOB,
                id_proof_last4 TEXT,
                city TEXT,
                address TEXT,
                is_foreign INTEGER DEFAULT 0,
                nationality TEXT,
                passport_number_enc BLOB,
                visa_number_enc BLOB,
                visa_expiry TEXT,
                id_image_path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                room_no INTEGER,
                room_type_id INTEGER,
                housekeeping_status TEXT DEFAULT "ok"
            );
            CREATE TABLE room_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                name TEXT,
                max_persons INTEGER
            );
            CREATE TABLE stays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                guest_id INTEGER,
                room_id INTEGER,
                reservation_id INTEGER,
                status TEXT DEFAULT "checked_out",
                check_in_date TEXT,
                checkout_planned TEXT,
                checkout_actual TEXT,
                referred_by_guest_id INTEGER
            );
            CREATE TABLE reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                booking_code TEXT,
                guest_id INTEGER,
                room_id INTEGER,
                check_in_date TEXT,
                check_out_date TEXT,
                persons INTEGER DEFAULT 1,
                rate REAL DEFAULT 1000,
                advance_amount REAL DEFAULT 0,
                advance_method TEXT DEFAULT "cash",
                status TEXT DEFAULT "pending",
                referred_by_guest_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hotel_id INTEGER,
                reservation_id INTEGER,
                type TEXT,
                amount REAL,
                status TEXT
            );
        ');

        $this->guestRepo = new GuestRepository($this->db);
        $this->service = new GuestService($this->guestRepo);
    }

    public function testToPublicReturnsNullIdProofWhenNoIdProofSaved(): void
    {
        // Guest created with null ID proof (e.g. from phone booking)
        $rawGuest = [
            'id' => 42,
            'name' => 'Kalai',
            'phone' => '8545979946',
            'email' => null,
            'id_proof_type' => 'Aadhaar', // Old DB column default, but no proof actually entered
            'id_proof_number_enc' => null,
            'id_proof_last4' => null,
            'passport_number_enc' => null,
            'city' => 'Madurai',
            'address' => null,
            'is_foreign' => 0,
            'nationality' => null,
            'visa_expiry' => null,
            'id_image_path' => null,
            'created_at' => '2026-11-26 09:33:37',
        ];

        $public = $this->service->toPublic($rawGuest);

        $this->assertNull($public['idProofType'], 'idProofType must be null when no proof was saved');
        $this->assertNull($public['idProofMasked']);
        $this->assertNull($public['idProofLast4']);
        $this->assertFalse($public['hasIdProof']);
        $this->assertSame('2026-11-26 09:33:37', $public['created_at']);
    }

    public function testToPublicReturnsAadhaarWhenActualAadhaarProofSaved(): void
    {
        $rawGuest = [
            'id' => 43,
            'name' => 'Ramya',
            'phone' => '6789799996',
            'email' => null,
            'id_proof_type' => 'Aadhaar',
            'id_proof_number_enc' => Crypto::encrypt('123456783772'),
            'id_proof_last4' => '3772',
            'passport_number_enc' => null,
            'city' => 'Chennai',
            'address' => null,
            'is_foreign' => 0,
            'nationality' => null,
            'visa_expiry' => null,
            'id_image_path' => null,
            'created_at' => '2026-11-25 17:05:47',
        ];

        $public = $this->service->toPublic($rawGuest);

        $this->assertSame('Aadhaar', $public['idProofType']);
        $this->assertSame('3772', $public['idProofLast4']);
        $this->assertSame('XXXX XXXX 3772', $public['idProofMasked']);
        $this->assertTrue($public['hasIdProof']);
    }

    public function testToPublicDoesNotConfuseDocumentUploadWithIdProofType(): void
    {
        // Guest uploaded an image/document but no ID proof number was collected/saved
        $rawGuest = [
            'id' => 44,
            'name' => 'Doc Only Guest',
            'phone' => '9876543210',
            'email' => null,
            'id_proof_type' => 'Aadhaar',
            'id_proof_number_enc' => null,
            'id_proof_last4' => null,
            'passport_number_enc' => null,
            'city' => null,
            'address' => null,
            'is_foreign' => 0,
            'nationality' => null,
            'visa_expiry' => null,
            'id_image_path' => 'guests/44-id.jpg',
            'created_at' => '2026-11-25 16:00:00',
        ];

        $public = $this->service->toPublic($rawGuest);

        $this->assertNull($public['idProofType'], 'Must not assign Aadhaar or treat document upload as ID proof type');
        $this->assertTrue($public['hasIdImage'], 'Document upload indicator is preserved');
        $this->assertFalse($public['hasIdProof'], 'hasIdProof is false because no number was entered');
    }

    public function testFindOrCreateMinimalDoesNotAssignAadhaarDefault(): void
    {
        $result = $this->service->findOrCreateMinimal(1, '9876543210', 'New Booking Guest', 'Salem');

        $this->assertNotNull($result['id']);
        $this->assertSame('New Booking Guest', $result['name']);
        $this->assertNull($result['id_proof_type'], 'findOrCreateMinimal must not assign Aadhaar by default');
        $this->assertNull($result['id_proof_number_enc']);
        $this->assertNull($result['id_proof_last4']);
    }

    public function testGuestRepositorySearchSortsByRecentRegisteredFirst(): void
    {
        // Insert guests with different created_at
        $this->db->exec("
            INSERT INTO guests (hotel_id, name, phone, created_at) VALUES (1, 'Oldest Guest', '9876500001', '2026-11-20 10:00:00');
            INSERT INTO guests (hotel_id, name, phone, created_at) VALUES (1, 'Middle Guest', '9876500002', '2026-11-24 10:00:00');
            INSERT INTO guests (hotel_id, name, phone, created_at) VALUES (1, 'Newest Guest 1', '9876500003', '2026-11-26 09:00:00');
            INSERT INTO guests (hotel_id, name, phone, created_at) VALUES (1, 'Newest Guest 2', '9876500004', '2026-11-26 09:00:00');
        ");

        $results = $this->guestRepo->search(1, '');

        $this->assertCount(4, $results);
        // Latest registered guest first, secondary sorting by id DESC
        $this->assertSame('Newest Guest 2', $results[0]['name']);
        $this->assertSame('Newest Guest 1', $results[1]['name']);
        $this->assertSame('Middle Guest', $results[2]['name']);
        $this->assertSame('Oldest Guest', $results[3]['name']);
    }

    public function testReservationRepositoryListSortsByMostRecentlyCreatedFirst(): void
    {
        $this->db->exec("
            INSERT INTO rooms (id, hotel_id, room_no, room_type_id) VALUES (1, 1, 101, 1);
            INSERT INTO room_types (id, hotel_id, name, max_persons) VALUES (1, 1, 'Standard', 2);
            INSERT INTO guests (id, hotel_id, name, phone) VALUES (1, 1, 'Guest A', '9876500001');

            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, check_out_date, created_at)
            VALUES (1, 1, 'BK-1', 1, 1, '2026-11-28', '2026-11-30', '2026-11-20 10:00:00');

            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, check_out_date, created_at)
            VALUES (2, 1, 'BK-2', 1, 1, '2026-11-26', '2026-11-27', '2026-11-25 15:00:00');

            INSERT INTO reservations (id, hotel_id, booking_code, guest_id, room_id, check_in_date, check_out_date, created_at)
            VALUES (3, 1, 'BK-3', 1, 1, '2026-11-27', '2026-11-29', '2026-11-26 09:00:00');
        ");

        $resRepo = new ReservationRepository($this->db);
        $pending = $resRepo->listPending(1);
        $all = $resRepo->listAll(1);

        $this->assertCount(3, $pending);
        // BK-3 was created newest, then BK-2, then BK-1
        $this->assertSame('BK-3', $pending[0]['booking_code']);
        $this->assertSame('BK-2', $pending[1]['booking_code']);
        $this->assertSame('BK-1', $pending[2]['booking_code']);

        $this->assertSame('BK-3', $all[0]['booking_code']);
        $this->assertSame('BK-2', $all[1]['booking_code']);
        $this->assertSame('BK-1', $all[2]['booking_code']);
    }
}
