<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\OccupantDocumentRepository;
use App\Repository\OccupantRepository;
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
use App\Service\OccupantDocumentService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use App\Support\OccupantDocumentUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class SimplifiedCheckInAndDocumentsTest extends TestCase
{
    private const HOTEL_ID = 994;
    private const OTHER_HOTEL_ID = 995;

    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private OccupantDocumentService $occupantDocService;
    private OccupantDocumentUploader $uploader;

    private int $roomStandardId;
    private int $roomSuiteId;
    private string $tempDir;
    private array $createdTempFiles = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->tempDir = sys_get_temp_dir() . '/tc_test_uploads_' . bin2hex(random_bytes(4));
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
        $this->uploader = new OccupantDocumentUploader($this->tempDir);

        // Setup hotel 994
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Test Hotel 994', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'SIMP994', 12, 'Asia/Kolkata')");

        // Setup hotel 995 (for tenant isolation tests)
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::OTHER_HOTEL_ID . ", 'Test Hotel 995', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::OTHER_HOTEL_ID . ", 'SIMP995', 12, 'Asia/Kolkata')");

        // Room types: standard (max 2) and suite (max 3)
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9941, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 1500.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9942, " . self::HOTEL_ID . ", 'SUT', 'Suite Room', 3000.00, 3)");

        // Rooms
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99401, " . self::HOTEL_ID . ", 201, 2, 9941, 'ok')");
        $this->roomStandardId = 99401;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99402, " . self::HOTEL_ID . ", 202, 2, 9942, 'ok')");
        $this->roomSuiteId = 99402;

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $roomRepo = new RoomRepository($this->db);
        $reservationRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hkLogRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($reservationRepo, $stayRepo);
        $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $this->occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $stayRepo, $this->uploader);

        $this->stayService = new StayService(
            $this->db,
            $stayRepo,
            $reservationRepo,
            $roomRepo,
            new StayChargeRepository($this->db),
            $paymentRepo,
            $hkLogRepo,
            $settingsRepo,
            $guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            null,
            $this->occupantDocService
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $reservationRepo,
            $roomRepo,
            $guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $audit,
            $stayRepo
        );

        $this->roomService = new RoomService(
            $roomRepo,
            new RoomTypeRepository($this->db),
            $hkLogRepo,
            $audit,
            $settingsRepo
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();

        foreach ($this->createdTempFiles as $f) {
            if (file_exists($f)) {
                @unlink($f);
            }
        }
        $this->removeDirectory($this->tempDir);
    }

    private function cleanup(): void
    {
        $this->db->exec('DELETE FROM occupant_documents WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM occupants WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM payments WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM stays WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM reservations WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM rooms WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM room_types WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM guests WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM settings WHERE hotel_id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
        $this->db->exec('DELETE FROM hotels WHERE id IN (' . self::HOTEL_ID . ', ' . self::OTHER_HOTEL_ID . ')');
    }

    private function removeDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $files = array_diff(scandir($dir) ?: [], ['.', '..']);
        foreach ($files as $file) {
            $path = "$dir/$file";
            is_dir($path) ? $this->removeDirectory($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    private function makeDummyFile(string $type, string $filename): array
    {
        $path = tempnam($this->tempDir, 'test_');
        $this->createdTempFiles[] = $path;

        if ($type === 'pdf') {
            file_put_contents($path, "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
            $mime = 'application/pdf';
        } elseif ($type === 'jpg' || $type === 'jpeg') {
            // Valid minimal JPEG header
            file_put_contents($path, "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00\xFF\xD9");
            $mime = 'image/jpeg';
        } elseif ($type === 'png') {
            // Valid minimal PNG header
            file_put_contents($path, "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82");
            $mime = 'image/png';
        } else {
            file_put_contents($path, "dummy content");
            $mime = 'text/plain';
        }

        return [
            'name' => $filename,
            'type' => $mime,
            'tmp_name' => $path,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($path),
        ];
    }

    /**
     * Requirement 1: Check-in with one person and one ID file.
     */
    public function testCheckInWithOnePersonAndOneIdFile(): void
    {
        $pdfFile = $this->makeDummyFile('pdf', 'primary_guest_aadhaar.pdf');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543210',
            guestName: 'Rajesh Kumar',
            idProofType: 'Aadhaar',
            idProofNumber: '123456789012',
            city: 'Pondicherry',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$pdfFile],
        );

        $this->assertEquals(1, $stay['persons']);
        $this->assertNotEmpty($stay['occupants']);
        $this->assertCount(1, $stay['occupants']);
        $this->assertEquals(1, $stay['occupants'][0]['occupant_number']);
        $this->assertEquals('Rajesh Kumar', $stay['occupants'][0]['name']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);

        $this->assertNotEmpty($stay['documents']);
        $this->assertCount(1, $stay['documents']);
        $doc = $stay['documents'][0];
        $this->assertEquals('primary_guest_aadhaar.pdf', $doc['original_filename']);
        $this->assertEquals('application/pdf', $doc['mime_type']);

        // Check file exists in storage
        $storedAbs = $this->uploader->absolutePath($doc['file_path']);
        $this->assertFileExists($storedAbs);
    }

    /**
     * Requirement 2: Check-in with two persons and two ID files.
     */
    public function testCheckInWithTwoPersonsAndTwoIdFiles(): void
    {
        $file1 = $this->makeDummyFile('jpg', 'guest1_id.jpg');
        $file2 = $this->makeDummyFile('png', 'guest2_id.png');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543211',
            guestName: 'Anil Sharma',
            idProofType: 'Driving Licence',
            idProofNumber: 'DL12345678',
            city: 'Chennai',
            persons: 2,
            days: 2,
            rate: 1500.00,
            advanceAmount: 1000.00,
            advanceMethod: 'upi',
            userId: 1,
            documentFiles: [$file1, $file2],
            occupantTargetIndexes: [0 => 0, 1 => 1],
        );

        $this->assertEquals(2, $stay['persons']);
        $this->assertCount(2, $stay['occupants']);

        // Occupant 1 is primary
        $this->assertEquals(1, $stay['occupants'][0]['occupant_number']);
        $this->assertEquals('Anil Sharma', $stay['occupants'][0]['name']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);

        // Occupant 2 has no required name
        $this->assertEquals(2, $stay['occupants'][1]['occupant_number']);
        $this->assertNull($stay['occupants'][1]['name']);
        $this->assertEquals(0, $stay['occupants'][1]['is_primary']);

        // 2 documents distributed to occupants
        $this->assertCount(2, $stay['documents']);
        $this->assertEquals('guest1_id.jpg', $stay['documents'][0]['original_filename']);
        $this->assertEquals('guest2_id.png', $stay['documents'][1]['original_filename']);

        // Occupant 1 has document 1, Occupant 2 has document 2
        $this->assertEquals($stay['occupants'][0]['id'], $stay['documents'][0]['occupant_id']);
        $this->assertEquals($stay['occupants'][1]['id'], $stay['documents'][1]['occupant_id']);
    }

    /**
     * Requirement 3: Check-in with three persons and multiple ID files.
     */
    public function testCheckInWithThreePersonsAndMultipleIdFiles(): void
    {
        $file1 = $this->makeDummyFile('pdf', 'doc_person1.pdf');
        $file2 = $this->makeDummyFile('jpg', 'doc_person2.jpg');
        $file3 = $this->makeDummyFile('png', 'doc_person3.png');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomSuiteId, // Suite allows 3 persons
            guestPhone: '9876543212',
            guestName: 'Suresh Patel',
            idProofType: 'Passport',
            idProofNumber: 'P1234567',
            city: 'Bangalore',
            persons: 3,
            days: 1,
            rate: 3000.00,
            advanceAmount: 1000.00,
            advanceMethod: 'card',
            userId: 1,
            documentFiles: [$file1, $file2, $file3],
        );

        $this->assertEquals(3, $stay['persons']);
        $this->assertCount(3, $stay['occupants']);
        $this->assertCount(3, $stay['documents']);

        $this->assertEquals('doc_person1.pdf', $stay['documents'][0]['original_filename']);
        $this->assertEquals('doc_person2.jpg', $stay['documents'][1]['original_filename']);
        $this->assertEquals('doc_person3.png', $stay['documents'][2]['original_filename']);
    }

    /**
     * Requirement 4: Uploading multiple documents for the same occupant.
     */
    public function testUploadingMultipleDocumentsForSameOccupant(): void
    {
        $doc1 = $this->makeDummyFile('pdf', 'aadhaar_front.pdf');
        $doc2 = $this->makeDummyFile('jpg', 'aadhaar_back.jpg');

        // Check in 1 person with 2 documents
        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543213',
            guestName: 'Meera Nair',
            idProofType: 'Aadhaar',
            idProofNumber: '999888777666',
            city: 'Kochi',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$doc1, $doc2],
            occupantTargetIndexes: [0 => 0, 1 => 0],
        );

        $this->assertCount(1, $stay['occupants']);
        $occupantId = (int) $stay['occupants'][0]['id'];

        $this->assertCount(2, $stay['documents']);
        $this->assertEquals($occupantId, $stay['documents'][0]['occupant_id']);
        $this->assertEquals($occupantId, $stay['documents'][1]['occupant_id']);

        // Upload a 3rd document directly to the occupant
        $doc3 = $this->makeDummyFile('png', 'voter_id.png');
        $uploaded = $this->occupantDocService->uploadDocumentForOccupant(self::HOTEL_ID, $occupantId, $doc3);
        $this->assertEquals($occupantId, $uploaded['occupant_id']);

        $updatedDocs = $this->occupantDocService->getDocumentsForStay(self::HOTEL_ID, (int) $stay['id']);
        $this->assertCount(3, $updatedDocs);
        foreach ($updatedDocs as $d) {
            $this->assertEquals($occupantId, $d['occupant_id']);
        }
    }

    /**
     * Requirement 5: Removing a selected file before saving & format validation.
     */
    public function testFileValidationAndUploadFiltering(): void
    {
        // 1. Invalid file format should be rejected
        $badFile = $this->makeDummyFile('text', 'script.txt');
        $this->expectException(ApiException::class);

        $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543214',
            guestName: 'Bad Format Guest',
            idProofType: 'Other',
            idProofNumber: 'OTHER123',
            city: 'Goa',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$badFile],
        );
    }

    /**
     * Requirement 6: Viewing uploaded documents after saving.
     */
    public function testViewingUploadedDocumentsAfterSaving(): void
    {
        $pdfFile = $this->makeDummyFile('pdf', 'test_view_doc.pdf');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543215',
            guestName: 'Kavitha Devi',
            idProofType: 'Aadhaar',
            idProofNumber: '444455556666',
            city: 'Madurai',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$pdfFile],
        );

        $docId = (int) $stay['documents'][0]['id'];

        // Retrieve document viewing/download stream info
        $viewInfo = $this->occupantDocService->getDocumentFilePath(self::HOTEL_ID, $docId);

        $this->assertEquals('test_view_doc.pdf', $viewInfo['filename']);
        $this->assertEquals('application/pdf', $viewInfo['mime_type']);
        $this->assertFileExists($viewInfo['path']);
        $this->assertGreaterThan(0, $viewInfo['size']);

        // Check stay find endpoint also returns documents
        $fetchedStay = $this->stayService->find((int) $stay['id'], self::HOTEL_ID);
        $this->assertNotEmpty($fetchedStay['documents']);
        $this->assertEquals($docId, $fetchedStay['documents'][0]['id']);
    }

    /**
     * Requirement 7: Reservation check-in with actual persons and documents.
     */
    public function testReservationCheckInWithActualPersonsAndDocuments(): void
    {
        $today = date('Y-m-d');
        $checkout = date('Y-m-d', strtotime('+2 days'));

        // 1. Create a reservation with 1 person
        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543216',
            guestName: 'Venkatesh Iyer',
            checkIn: $today,
            checkOut: $checkout,
            persons: 1,
            rate: 1500.00,
            advanceAmount: 1000.00,
            advanceMethod: 'upi',
            userId: 1,
        );

        $this->assertEquals('pending', $res['status']);
        $this->assertEquals(1, $res['persons']);

        // 2. Check-in from reservation updating actual persons to 2 with 2 ID documents
        $doc1 = $this->makeDummyFile('pdf', 'venkatesh_passport.pdf');
        $doc2 = $this->makeDummyFile('jpg', 'companion_id.jpg');

        $stay = $this->stayService->checkInFromReservation(
            reservationId: (int) $res['id'],
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2, // Actual persons count updated from 1 to 2
            documentFiles: [$doc1, $doc2],
        );

        $this->assertEquals('in_house', $stay['status']);
        $this->assertEquals((int) $res['id'], (int) $stay['reservation_id']);
        $this->assertEquals(2, $stay['persons']); // stays.persons synchronized

        $this->assertCount(2, $stay['occupants']);
        $this->assertCount(2, $stay['documents']);
        $this->assertEquals('venkatesh_passport.pdf', $stay['documents'][0]['original_filename']);
        $this->assertEquals('companion_id.jpg', $stay['documents'][1]['original_filename']);

        // Check reservation marked checked_in
        $updatedRes = $this->reservationService->find((int) $res['id'], self::HOTEL_ID);
        $this->assertEquals('checked_in', $updatedRes['status']);
    }

    /**
     * Requirement 8: Direct check-in preserves primary guest and advance payment.
     */
    public function testDirectCheckInPreservesPrimaryGuestAndAdvance(): void
    {
        $doc = $this->makeDummyFile('png', 'direct_checkin_id.png');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543217',
            guestName: 'Arjun Das',
            idProofType: 'Driving Licence',
            idProofNumber: 'TN0120200001',
            city: 'Trichy',
            persons: 2,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$doc],
        );

        $this->assertEquals(2, $stay['persons']);
        $this->assertEquals('Arjun Das', $stay['guest_name']);
        $this->assertNotEmpty($stay['guest_id']);

        // Occupant 1 links to primary guest
        $this->assertEquals($stay['guest_id'], $stay['occupants'][0]['guest_id']);
        $this->assertEquals('Arjun Das', $stay['occupants'][0]['name']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);

        // Occupant 2 is created without requiring name
        $this->assertNull($stay['occupants'][1]['name']);
        $this->assertEquals(0, $stay['occupants'][1]['is_primary']);
    }

    /**
     * Requirement 9: Hotel-level access restrictions.
     */
    public function testHotelLevelAccessRestrictions(): void
    {
        $doc = $this->makeDummyFile('pdf', 'hotel994_secret.pdf');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543218',
            guestName: 'Isolation User',
            idProofType: 'Aadhaar',
            idProofNumber: '111122223333',
            city: 'Salem',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$doc],
        );

        $docId = (int) $stay['documents'][0]['id'];
        $stayId = (int) $stay['id'];

        // Accessing Hotel 994's document using Hotel 995 must throw 404
        try {
            $this->occupantDocService->getDocumentFilePath(self::OTHER_HOTEL_ID, $docId);
            $this->fail('Expected ApiException for cross-tenant document download');
        } catch (ApiException $e) {
            $this->assertEquals(404, $e->getStatus());
        }

        // Accessing Hotel 994's stay documents using Hotel 995 must throw 404
        try {
            $this->occupantDocService->getDocumentsForStay(self::OTHER_HOTEL_ID, $stayId);
            $this->fail('Expected ApiException for cross-tenant stay documents listing');
        } catch (ApiException $e) {
            $this->assertEquals(404, $e->getStatus());
        }

        // Deleting Hotel 994's document using Hotel 995 must throw 404
        try {
            $this->occupantDocService->deleteDocument(self::OTHER_HOTEL_ID, $docId);
            $this->fail('Expected ApiException for cross-tenant document deletion');
        } catch (ApiException $e) {
            $this->assertEquals(404, $e->getStatus());
        }
    }

    /**
     * Requirement 10: Existing booking, max capacity and payment workflows preserved.
     */
    public function testExistingBookingAndPaymentRulesPreserved(): void
    {
        // 1. Mandatory advance payment required for direct check-in
        try {
            $this->stayService->directCheckIn(
                hotelId: self::HOTEL_ID,
                roomId: $this->roomStandardId,
                guestPhone: '9876543219',
                guestName: 'No Advance Guest',
                idProofType: 'Aadhaar',
                idProofNumber: '111100001111',
                city: 'Delhi',
                persons: 1,
                days: 1,
                rate: 1500.00,
                advanceAmount: 0.00, // zero advance blocked
                advanceMethod: 'cash',
                userId: 1,
            );
            $this->fail('Expected ApiException for missing advance payment');
        } catch (ApiException $e) {
            $this->assertStringContainsString('advance amount', $e->getMessage());
        }

        // 2. Maximum room capacity exceeded blocked
        try {
            $this->stayService->directCheckIn(
                hotelId: self::HOTEL_ID,
                roomId: $this->roomStandardId, // Standard room allows max 2 persons
                guestPhone: '9876543220',
                guestName: 'Over Capacity Guest',
                idProofType: 'Aadhaar',
                idProofNumber: '111100002222',
                city: 'Delhi',
                persons: 5, // 5 persons exceeds max 2
                days: 1,
                rate: 1500.00,
                advanceAmount: 500.00,
                advanceMethod: 'cash',
                userId: 1,
            );
            $this->fail('Expected ApiException for exceeding max_persons');
        } catch (ApiException $e) {
            $this->assertStringContainsString('maximum of 2 persons', $e->getMessage());
        }

        // 3. Room cards display occupied persons count
        $doc = $this->makeDummyFile('jpg', 'room_display_test.jpg');
        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876543221',
            guestName: 'Display Test',
            idProofType: 'Aadhaar',
            idProofNumber: '111100003333',
            city: 'Delhi',
            persons: 2,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$doc],
        );

        $roomsList = $this->roomService->listRooms(self::HOTEL_ID);
        $found = null;
        foreach ($roomsList['rooms'] as $r) {
            if ($r['id'] === $this->roomStandardId) {
                $found = $r;
                break;
            }
        }

        $this->assertNotNull($found);
        $this->assertEquals('occupied', $found['status']);
        $this->assertEquals(2, $found['persons']); // persons populated on occupied room
    }
}
