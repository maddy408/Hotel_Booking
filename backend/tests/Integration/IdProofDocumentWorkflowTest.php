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
use App\Router\Request;
use App\Controller\GuestController;
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

final class IdProofDocumentWorkflowTest extends TestCase
{
    private const HOTEL_ID = 996;
    private const OTHER_HOTEL_ID = 997;

    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private GuestService $guestService;
    private GuestRepository $guestRepo;
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private OccupantDocumentService $occupantDocService;
    private OccupantDocumentRepository $occupantDocRepo;
    private OccupantDocumentUploader $uploader;
    private GuestController $guestController;

    private int $room1Id;
    private int $room2Id;
    private string $tempDir;
    private array $createdTempFiles = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        \App\Database\SchemaManager::ensureColumns($this->db);
        $this->cleanup();

        $this->tempDir = sys_get_temp_dir() . '/tc_doc_test_' . bin2hex(random_bytes(4));
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
        $this->uploader = new OccupantDocumentUploader($this->tempDir);

        // Setup hotel 996
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Workflow Hotel 996', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'WF996', 12, 'Asia/Kolkata')");

        // Setup hotel 997 (tenant isolation)
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::OTHER_HOTEL_ID . ", 'Workflow Hotel 997', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::OTHER_HOTEL_ID . ", 'WF997', 12, 'Asia/Kolkata')");

        // Room types
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9961, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 2000.00, 4)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9971, " . self::OTHER_HOTEL_ID . ", 'STD', 'Standard Room', 2000.00, 4)");

        // Rooms
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99601, " . self::HOTEL_ID . ", 301, 3, 9961, 'ok')");
        $this->room1Id = 99601;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99602, " . self::HOTEL_ID . ", 302, 3, 9961, 'ok')");
        $this->room2Id = 99602;

        $this->guestRepo = new GuestRepository($this->db);
        $this->guestService = new GuestService($this->guestRepo);
        $roomRepo = new RoomRepository($this->db);
        $this->reservationRepo = new ReservationRepository($this->db);
        $this->stayRepo = new StayRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $hkLogRepo = new HousekeepingLogRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($this->reservationRepo, $this->stayRepo);
        $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $occupantRepo = new OccupantRepository($this->db);
        $this->occupantDocRepo = new OccupantDocumentRepository($this->db);
        $this->occupantDocService = new OccupantDocumentService(
            $occupantRepo,
            $this->occupantDocRepo,
            $this->stayRepo,
            $this->uploader,
            $this->reservationRepo
        );

        $this->stayService = new StayService(
            $this->db,
            $this->stayRepo,
            $this->reservationRepo,
            $roomRepo,
            new StayChargeRepository($this->db),
            $paymentRepo,
            $hkLogRepo,
            $settingsRepo,
            $this->guestService,
            $availability,
            $billing,
            $invoiceService,
            $audit,
            null,
            $this->occupantDocService
        );

        $this->reservationService = new ReservationService(
            $this->db,
            $this->reservationRepo,
            $roomRepo,
            $this->guestService,
            $availability,
            $paymentRepo,
            $settingsRepo,
            $audit,
            $this->stayRepo,
            null,
            $this->occupantDocService
        );

        $this->guestController = new GuestController(
            $this->guestRepo,
            $this->guestService,
            $this->stayRepo,
            $this->reservationRepo,
            $this->occupantDocService
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
            file_put_contents($path, "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00\xFF\xD9");
            $mime = 'image/jpeg';
        } elseif ($type === 'png') {
            file_put_contents($path, "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82");
            $mime = 'image/png';
        } else {
            file_put_contents($path, "dummy text");
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

    /** 1. Pre-Booking without ID documents */
    public function test01_PreBookingWithoutIdDocuments(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543201',
            'Ramesh Kumar',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            1000.00,
            'upi',
            1,
            documentFiles: []
        );

        $this->assertNotEmpty($booking['id']);
        $this->assertSame('pending', $booking['status']);
        $this->assertSame(2, (int) $booking['persons']);

        $docs = $this->occupantDocService->getDocumentsForReservation(self::HOTEL_ID, (int) $booking['id']);
        $this->assertEmpty($docs);
    }

    /** 2. Pre-Booking with multiple ID documents */
    public function test02_PreBookingWithMultipleIdDocuments(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $file1 = $this->makeDummyFile('pdf', 'aadhaar_ramesh.pdf');
        $file2 = $this->makeDummyFile('jpg', 'passport_ramesh.jpg');

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543202',
            'Ramesh With Docs',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            1000.00,
            'cash',
            1,
            documentFiles: [$file1, $file2]
        );

        $bookingId = (int) $booking['id'];
        $docs = $this->occupantDocService->getDocumentsForReservation(self::HOTEL_ID, $bookingId);

        $this->assertCount(2, $docs);
        $this->assertSame('aadhaar_ramesh.pdf', $docs[0]['original_filename']);
        $this->assertSame('application/pdf', $docs[0]['mime_type']);
        $this->assertSame($bookingId, (int) $docs[0]['reservation_id']);
        $this->assertNull($docs[0]['stay_id']);
        $this->assertNull($docs[0]['occupant_id']);

        $this->assertSame('passport_ramesh.jpg', $docs[1]['original_filename']);
        $this->assertSame('image/jpeg', $docs[1]['mime_type']);
        $this->assertSame($bookingId, (int) $docs[1]['reservation_id']);
        $this->assertNull($docs[1]['stay_id']);
    }

    /** 3. Reservation Check-In with previously uploaded documents */
    public function test03_ReservationCheckInWithPreviouslyUploadedDocuments(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $file1 = $this->makeDummyFile('pdf', 'pre_id1.pdf');
        $file2 = $this->makeDummyFile('png', 'pre_id2.png');

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543203',
            'Checkin Prebook Guest',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            1000.00,
            'cash',
            1,
            documentFiles: [$file1, $file2]
        );
        $bookingId = (int) $booking['id'];

        $stay = $this->stayService->checkInFromReservation($bookingId, self::HOTEL_ID, 1);
        $stayId = (int) $stay['id'];

        // Documents must now be linked to the stay while preserving reservation_id
        $stayDocs = $this->occupantDocService->getDocumentsForStay(self::HOTEL_ID, $stayId);
        $this->assertCount(2, $stayDocs);

        foreach ($stayDocs as $doc) {
            $this->assertSame($bookingId, (int) $doc['reservation_id']);
            $this->assertSame($stayId, (int) $doc['stay_id']);
        }
    }

    /** 4. Adding more documents during Check-In */
    public function test04_AddingMoreDocumentsDuringCheckIn(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $preFile = $this->makeDummyFile('pdf', 'pre_aadhaar.pdf');
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543204',
            'Add More Guest',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            1000.00,
            'cash',
            1,
            documentFiles: [$preFile]
        );
        $bookingId = (int) $booking['id'];

        // Additional file during check-in
        $checkinFile = $this->makeDummyFile('jpg', 'checkin_license.jpg');
        $stay = $this->stayService->checkInFromReservation(
            $bookingId,
            self::HOTEL_ID,
            1,
            persons: 2,
            documentFiles: [$checkinFile]
        );
        $stayId = (int) $stay['id'];

        $stayDocs = $this->occupantDocService->getDocumentsForStay(self::HOTEL_ID, $stayId);
        $this->assertCount(2, $stayDocs);

        $filenames = array_column($stayDocs, 'original_filename');
        $this->assertContains('pre_aadhaar.pdf', $filenames);
        $this->assertContains('checkin_license.jpg', $filenames);
    }

    /** 5. No duplicate documents after reservation Check-In */
    public function test05_NoDuplicateDocumentsAfterReservationCheckIn(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $file1 = $this->makeDummyFile('pdf', 'unique_doc1.pdf');
        $file2 = $this->makeDummyFile('jpg', 'unique_doc2.jpg');

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543205',
            'No Dup Guest',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            1000.00,
            'cash',
            1,
            documentFiles: [$file1, $file2]
        );
        $bookingId = (int) $booking['id'];

        $countBeforeCheckIn = count($this->occupantDocService->getDocumentsForReservation(self::HOTEL_ID, $bookingId));
        $this->assertSame(2, $countBeforeCheckIn);

        $stay = $this->stayService->checkInFromReservation($bookingId, self::HOTEL_ID, 1);
        $stayId = (int) $stay['id'];

        $totalDocsInDb = (int) $this->db->query(
            "SELECT COUNT(*) FROM occupant_documents WHERE hotel_id = " . self::HOTEL_ID . " AND reservation_id = {$bookingId}"
        )->fetchColumn();

        // Exactly 2 documents in DB; no duplicates created!
        $this->assertSame(2, $totalDocsInDb);
    }

    /** 6. Direct Check-In with multiple documents */
    public function test06_DirectCheckInWithMultipleDocuments(): void
    {
        $file1 = $this->makeDummyFile('pdf', 'direct_doc1.pdf');
        $file2 = $this->makeDummyFile('png', 'direct_doc2.png');

        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543206',
            'Direct Guest',
            'Aadhaar',
            '123456789012',
            'Chennai',
            3,
            1,
            2000.00,
            500.00,
            'cash',
            1,
            documentFiles: [$file1, $file2]
        );
        $stayId = (int) $stay['id'];

        $docs = $this->occupantDocService->getDocumentsForStay(self::HOTEL_ID, $stayId);
        $this->assertCount(2, $docs);
        $this->assertNull($docs[0]['reservation_id']);
        $this->assertSame($stayId, (int) $docs[0]['stay_id']);
    }

    /** 7. Guest Details page showing all bookings */
    public function test07_GuestDetailsShowingAllBookings(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543207',
            'Guest With Bookings',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            500.00,
            'cash',
            1
        );
        $guestId = (int) $booking['guest_id'];

        $request = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $request->routeParams = ['id' => (string) $guestId];
        $ref = new \ReflectionProperty($request, 'attributes');
        $ref->setAccessible(true);
        $ref->setValue($request, ['hotelId' => self::HOTEL_ID, 'userId' => 1]);

        $details = $this->guestController->show($request);

        $this->assertNotEmpty($details['bookings']);
        $firstBk = $details['bookings'][0];
        $this->assertSame($booking['booking_code'], $firstBk['booking_code']);
        $this->assertSame(301, (int) $firstBk['room_no']);
        $this->assertSame($checkIn, $firstBk['check_in_date']);
        $this->assertSame($checkOut, $firstBk['check_out_date']);
        $this->assertSame(2, (int) $firstBk['persons']);
        $this->assertSame('pending', $firstBk['status']);
    }

    /** 8. Guest Details page showing all stays */
    public function test08_GuestDetailsShowingAllStays(): void
    {
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543208',
            'Guest With Stays',
            'Passport',
            'P9876543',
            'Bangalore',
            3,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $guestId = (int) $stay['guest_id'];

        $request = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $request->routeParams = ['id' => (string) $guestId];
        $ref = new \ReflectionProperty($request, 'attributes');
        $ref->setAccessible(true);
        $ref->setValue($request, ['hotelId' => self::HOTEL_ID, 'userId' => 1]);

        $details = $this->guestController->show($request);

        $this->assertNotEmpty($details['stays']);
        $firstStay = $details['stays'][0];
        $this->assertSame(301, (int) $firstStay['room_no']);
        $this->assertSame(3, (int) $firstStay['persons']);
        $this->assertSame('in_house', $firstStay['status']);
        $this->assertNull($firstStay['reservation_id']);
    }

    /** 9. Documents grouped under the correct booking/stay */
    public function test09_DocumentsGroupedUnderCorrectBookingOrStay(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        $file1 = $this->makeDummyFile('pdf', 'bk_doc.pdf');
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543209',
            'Grouped Docs Guest',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            500.00,
            'cash',
            1,
            documentFiles: [$file1]
        );
        $guestId = (int) $booking['guest_id'];

        $request = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $request->routeParams = ['id' => (string) $guestId];
        $ref = new \ReflectionProperty($request, 'attributes');
        $ref->setAccessible(true);
        $ref->setValue($request, ['hotelId' => self::HOTEL_ID, 'userId' => 1]);

        $details = $this->guestController->show($request);
        $this->assertNotEmpty($details['documents']);
        $this->assertSame('bk_doc.pdf', $details['documents'][0]['original_filename']);
        $this->assertSame((int) $booking['id'], (int) $details['documents'][0]['reservation_id']);
    }

    /** 10. Correct expected and actual persons counts */
    public function test10_CorrectExpectedAndActualPersonsCounts(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+2 days'));

        // Booking with expected 2 persons
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543210',
            'Persons Count Guest',
            $checkIn,
            $checkOut,
            2,
            2000.00,
            500.00,
            'cash',
            1
        );
        $bookingId = (int) $booking['id'];
        $guestId = (int) $booking['guest_id'];

        // Guest checks in with actual 3 persons
        $stay = $this->stayService->checkInFromReservation($bookingId, self::HOTEL_ID, 1, persons: 3);

        $request = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $request->routeParams = ['id' => (string) $guestId];
        $ref = new \ReflectionProperty($request, 'attributes');
        $ref->setAccessible(true);
        $ref->setValue($request, ['hotelId' => self::HOTEL_ID, 'userId' => 1]);

        $details = $this->guestController->show($request);

        // Booking retains expected 2 persons
        $this->assertSame(2, (int) $details['bookings'][0]['persons']);

        // Stay reflects actual 3 persons
        $this->assertSame(3, (int) $details['stays'][0]['persons']);
    }

    /** 11. Direct Check-In without a booking ID */
    public function test11_DirectCheckInWithoutBookingId(): void
    {
        $stay = $this->stayService->directCheckIn(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543211',
            'Walkin Direct',
            'Driving Licence',
            'DL123456',
            'Madurai',
            1,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );

        $this->assertNull($stay['reservation_id']);
        $this->assertSame('in_house', $stay['status']);
    }

    /** 12. Hotel-level document access restrictions */
    public function test12_HotelLevelDocumentAccessRestrictions(): void
    {
        $file = $this->makeDummyFile('pdf', 'hotel996_private.pdf');
        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543212',
            'Private Hotel Guest',
            date('Y-m-d'),
            date('Y-m-d', strtotime('+1 day')),
            1,
            2000.00,
            500.00,
            'cash',
            1,
            documentFiles: [$file]
        );
        $docs = $this->occupantDocService->getDocumentsForReservation(self::HOTEL_ID, (int) $booking['id']);
        $docId = (int) $docs[0]['id'];

        // Accessing from Hotel 996 succeeds
        $info = $this->occupantDocService->getDocumentFilePath(self::HOTEL_ID, $docId);
        $this->assertSame('hotel996_private.pdf', $info['filename']);

        // Accessing from Hotel 997 is rejected with 404
        $this->expectException(ApiException::class);
        $this->occupantDocService->getDocumentFilePath(self::OTHER_HOTEL_ID, $docId);
    }

    /** 13. Existing bookings and stays without uploaded documents */
    public function test13_ExistingBookingsAndStaysWithoutUploadedDocuments(): void
    {
        $checkIn = date('Y-m-d');
        $checkOut = date('Y-m-d', strtotime('+1 day'));

        $booking = $this->reservationService->create(
            self::HOTEL_ID,
            $this->room1Id,
            '9876543213',
            'No Docs Legacy Guest',
            $checkIn,
            $checkOut,
            1,
            2000.00,
            500.00,
            'cash',
            1
        );
        $guestId = (int) $booking['guest_id'];

        $request = new Request('GET', "/guests/{$guestId}", [], [], [], '127.0.0.1');
        $request->routeParams = ['id' => (string) $guestId];
        $ref = new \ReflectionProperty($request, 'attributes');
        $ref->setAccessible(true);
        $ref->setValue($request, ['hotelId' => self::HOTEL_ID, 'userId' => 1]);

        $details = $this->guestController->show($request);
        $this->assertIsArray($details['documents']);
        $this->assertEmpty($details['documents']);
        $this->assertCount(1, $details['bookings']);
    }
}
