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

final class OccupantDetailsAndCheckInTest extends TestCase
{
    private const HOTEL_ID = 991;
    private const OTHER_HOTEL_ID = 992;

    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private RoomService $roomService;
    private OccupantDocumentService $occupantDocService;
    private OccupantDocumentUploader $uploader;

    private int $roomStandardId;
    private int $roomDeluxeId;
    private string $tempDir;
    private array $createdTempFiles = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->tempDir = sys_get_temp_dir() . '/tc_occ_test_' . bin2hex(random_bytes(4));
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
        $this->uploader = new OccupantDocumentUploader($this->tempDir);

        // Setup hotel 991
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'KKK Lodge Pondy', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'TCP', 12, 'Asia/Kolkata')");

        // Setup hotel 992 (tenant isolation)
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::OTHER_HOTEL_ID . ", 'Other Hotel', 'Chennai')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::OTHER_HOTEL_ID . ", 'OTH', 12, 'Asia/Kolkata')");

        // Room types: Standard (max 2), Deluxe (max 4)
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9911, " . self::HOTEL_ID . ", 'STD', 'Standard Room', 1500.00, 2)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9912, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 3000.00, 4)");

        // Rooms
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99101, " . self::HOTEL_ID . ", 101, 1, 9911, 'ok')");
        $this->roomStandardId = 99101;

        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (99102, " . self::HOTEL_ID . ", 102, 1, 9912, 'ok')");
        $this->roomDeluxeId = 99102;

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
        $gstService = new GstService($settingsRepo);
        $billing = new BillingService($gstService, new StayChargeRepository($this->db), $paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $occupantRepo = new OccupantRepository($this->db);
        $occupantDocRepo = new OccupantDocumentRepository($this->db);
        $this->occupantDocService = new OccupantDocumentService($occupantRepo, $occupantDocRepo, $stayRepo, $this->uploader, $reservationRepo);

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
            $stayRepo,
            $gstService,
            $this->occupantDocService
        );
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        foreach ($this->createdTempFiles as $file) {
            if (file_exists($file)) {
                @unlink($file);
            }
        }
        if (is_dir($this->tempDir)) {
            $this->rrmdir($this->tempDir);
        }
    }

    private function rrmdir(string $dir): void
    {
        foreach (scandir($dir) ?: [] as $file) {
            if ($file === '.' || $file === '..') continue;
            $path = $dir . '/' . $file;
            if (is_dir($path)) {
                $this->rrmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($dir);
    }

    private function cleanup(): void
    {
        $this->db->exec("DELETE FROM occupant_documents WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM occupants WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM payments WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM stays WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM reservations WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM guests WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM rooms WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM room_types WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM settings WHERE hotel_id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
        $this->db->exec("DELETE FROM hotels WHERE id IN (" . self::HOTEL_ID . ", " . self::OTHER_HOTEL_ID . ")");
    }

    private function makeDummyFile(string $ext, string $origName = 'test.pdf'): array
    {
        $path = tempnam($this->tempDir, 'test_');
        $this->createdTempFiles[] = $path;
        if ($ext === 'pdf') {
            file_put_contents($path, "%PDF-1.4 sample test file content");
            $mime = 'application/pdf';
        } elseif ($ext === 'png') {
            file_put_contents($path, "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" . str_repeat('A', 100));
            $mime = 'image/png';
        } elseif ($ext === 'webp') {
            file_put_contents($path, "RIFF" . pack('V', 100) . "WEBPVP8 " . str_repeat('B', 90));
            $mime = 'image/webp';
        } else {
            file_put_contents($path, "\xFF\xD8\xFF\xE0\x00\x10JFIF" . str_repeat('X', 100));
            $mime = 'image/jpeg';
        }

        return [
            'tmp_name' => $path,
            'name' => $origName,
            'size' => filesize($path),
            'error' => UPLOAD_ERR_OK,
            'type' => $mime,
        ];
    }

    /**
     * Case 1: Check-In with one person.
     */
    public function test01_CheckInWithOnePerson(): void
    {
        $occupants = [
            [
                'name' => 'Rajesh Kumar',
                'gender' => 'Male',
                'phone' => '9876543210',
            ],
        ];

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
            occupants: $occupants,
        );

        $this->assertEquals(1, $stay['persons']);
        $this->assertCount(1, $stay['occupants']);
        $this->assertEquals('Rajesh Kumar', $stay['occupants'][0]['name']);
        $this->assertEquals('Male', $stay['occupants'][0]['gender']);
        $this->assertEquals('9876543210', $stay['occupants'][0]['phone']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);
    }

    /**
     * Case 2: Check-In with two people.
     */
    public function test02_CheckInWithTwoPeople(): void
    {
        $occupants = [
            [
                'name' => 'Kavitha Ramesh',
                'gender' => 'Female',
                'phone' => '9876500001',
            ],
            [
                'name' => 'Ramesh Babu',
                'gender' => 'Male',
                'phone' => '9876500002',
            ],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9876500001',
            guestName: 'Kavitha Ramesh',
            idProofType: 'Driving Licence',
            idProofNumber: 'DL0420210001',
            city: 'Bangalore',
            persons: 2,
            days: 2,
            rate: 1500.00,
            advanceAmount: 1000.00,
            advanceMethod: 'upi',
            userId: 1,
            occupants: $occupants,
        );

        $this->assertEquals(2, $stay['persons']);
        $this->assertCount(2, $stay['occupants']);

        $this->assertEquals('Kavitha Ramesh', $stay['occupants'][0]['name']);
        $this->assertEquals('Female', $stay['occupants'][0]['gender']);
        $this->assertEquals('9876500001', $stay['occupants'][0]['phone']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);

        $this->assertEquals('Ramesh Babu', $stay['occupants'][1]['name']);
        $this->assertEquals('Male', $stay['occupants'][1]['gender']);
        $this->assertEquals('9876500002', $stay['occupants'][1]['phone']);
        $this->assertEquals(0, $stay['occupants'][1]['is_primary']);
    }

    /**
     * Case 3: Check-In with multiple people (3 people in Deluxe room).
     */
    public function test03_CheckInWithMultiplePeople(): void
    {
        $occupants = [
            ['name' => 'Suresh Raina', 'gender' => 'Male', 'phone' => '9811111111'],
            ['name' => 'Priyanka Raina', 'gender' => 'Female', 'phone' => '9822222222'],
            ['name' => 'Gracia Raina', 'gender' => 'Other', 'phone' => '9833333333'],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomDeluxeId,
            guestPhone: '9811111111',
            guestName: 'Suresh Raina',
            idProofType: 'Passport',
            idProofNumber: 'P1234567',
            city: 'Chennai',
            persons: 3,
            days: 3,
            rate: 3000.00,
            advanceAmount: 2000.00,
            advanceMethod: 'card',
            userId: 1,
            occupants: $occupants,
        );

        $this->assertEquals(3, $stay['persons']);
        $this->assertCount(3, $stay['occupants']);
        $this->assertEquals('Suresh Raina', $stay['occupants'][0]['name']);
        $this->assertEquals('Priyanka Raina', $stay['occupants'][1]['name']);
        $this->assertEquals('Gracia Raina', $stay['occupants'][2]['name']);
        $this->assertEquals('Other', $stay['occupants'][2]['gender']);
    }

    /**
     * Case 4: Actual persons count exceeding room capacity.
     */
    public function test04_ActualPersonsExceedingRoomCapacity(): void
    {
        // Standard room allows max 2 persons
        $occupants = [
            ['name' => 'Person 1', 'gender' => 'Male', 'phone' => '9000000001'],
            ['name' => 'Person 2', 'gender' => 'Female', 'phone' => '9000000002'],
            ['name' => 'Person 3', 'gender' => 'Other', 'phone' => '9000000003'],
        ];

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('allows a maximum of 2 persons');

        $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9000000001',
            guestName: 'Person 1',
            idProofType: 'Aadhaar',
            idProofNumber: '111122223333',
            city: 'Pondicherry',
            persons: 3, // Exceeds standard room max 2
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            occupants: $occupants,
        );
    }

    /**
     * Case 5: Missing occupant name, gender or phone.
     */
    public function test05_MissingOccupantNameGenderOrPhone(): void
    {
        // Missing name in occupant 2
        try {
            $this->stayService->directCheckIn(
                hotelId: self::HOTEL_ID,
                roomId: $this->roomStandardId,
                guestPhone: '9888888881',
                guestName: 'Valid Name',
                idProofType: 'Aadhaar',
                idProofNumber: '123412341234',
                city: 'Pondy',
                persons: 2,
                days: 1,
                rate: 1500.00,
                advanceAmount: 500.00,
                advanceMethod: 'cash',
                userId: 1,
                occupants: [
                    ['name' => 'Valid Name', 'gender' => 'Male', 'phone' => '9888888881'],
                    ['name' => '', 'gender' => 'Female', 'phone' => '9888888882'],
                ],
            );
            $this->fail('Expected validation exception for missing occupant name.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('name is required', $e->getMessage());
        }

        // Missing gender in occupant 2
        try {
            $this->stayService->directCheckIn(
                hotelId: self::HOTEL_ID,
                roomId: $this->roomStandardId,
                guestPhone: '9888888881',
                guestName: 'Valid Name',
                idProofType: 'Aadhaar',
                idProofNumber: '123412341234',
                city: 'Pondy',
                persons: 2,
                days: 1,
                rate: 1500.00,
                advanceAmount: 500.00,
                advanceMethod: 'cash',
                userId: 1,
                occupants: [
                    ['name' => 'Valid Name', 'gender' => 'Male', 'phone' => '9888888881'],
                    ['name' => 'Second Person', 'gender' => '', 'phone' => '9888888882'],
                ],
            );
            $this->fail('Expected validation exception for missing occupant gender.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('gender is required', $e->getMessage());
        }

        // Missing phone in occupant 2
        try {
            $this->stayService->directCheckIn(
                hotelId: self::HOTEL_ID,
                roomId: $this->roomStandardId,
                guestPhone: '9888888881',
                guestName: 'Valid Name',
                idProofType: 'Aadhaar',
                idProofNumber: '123412341234',
                city: 'Pondy',
                persons: 2,
                days: 1,
                rate: 1500.00,
                advanceAmount: 500.00,
                advanceMethod: 'cash',
                userId: 1,
                occupants: [
                    ['name' => 'Valid Name', 'gender' => 'Male', 'phone' => '9888888881'],
                    ['name' => 'Second Person', 'gender' => 'Female', 'phone' => '123'], // Invalid phone
                ],
            );
            $this->fail('Expected validation exception for invalid phone.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('phone number is required and must be 10 digits', $e->getMessage());
        }
    }

    /**
     * Case 6: Selecting multiple ID proof files together & associating with stay by default.
     */
    public function test06_SelectingMultipleIdProofFilesTogether(): void
    {
        $file1 = $this->makeDummyFile('pdf', 'stay_aadhaar.pdf');
        $file2 = $this->makeDummyFile('jpg', 'stay_license.jpg');

        $occupants = [
            ['name' => 'Deepak Verma', 'gender' => 'Male', 'phone' => '9777777771'],
            ['name' => 'Anjali Verma', 'gender' => 'Female', 'phone' => '9777777772'],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9777777771',
            guestName: 'Deepak Verma',
            idProofType: 'Aadhaar',
            idProofNumber: '998877665544',
            city: 'Madurai',
            persons: 2,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$file1, $file2],
            occupantTargetIndexes: [], // No target specified -> common stay documents
            occupants: $occupants,
        );

        $this->assertCount(2, $stay['documents']);
        $this->assertEquals('stay_aadhaar.pdf', $stay['documents'][0]['original_filename']);
        $this->assertEquals('stay_license.jpg', $stay['documents'][1]['original_filename']);

        // Both documents associated with the stay, occupant_id is null by default
        $this->assertEquals($stay['id'], $stay['documents'][0]['stay_id']);
        $this->assertEquals($stay['id'], $stay['documents'][1]['stay_id']);
        $this->assertNull($stay['documents'][0]['occupant_id']);
        $this->assertNull($stay['documents'][1]['occupant_id']);
    }

    /**
     * Case 7: Removing a selected file before submission.
     * When reception removes a file in UI, only the remaining files are sent to backend.
     */
    public function test07_RemovingSelectedFileBeforeSubmission(): void
    {
        $file1 = $this->makeDummyFile('pdf', 'keep_id.pdf');
        // $file2 was removed before submission, so only $file1 is sent

        $occupants = [
            ['name' => 'Manoj Tiwary', 'gender' => 'Male', 'phone' => '9666666661'],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9666666661',
            guestName: 'Manoj Tiwary',
            idProofType: 'Voter ID',
            idProofNumber: 'VTR1234567',
            city: 'Kolkata',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$file1],
            occupants: $occupants,
        );

        $this->assertCount(1, $stay['documents']);
        $this->assertEquals('keep_id.pdf', $stay['documents'][0]['original_filename']);
    }

    /**
     * Case 8: Saving and reopening occupant details.
     */
    public function test08_SavingAndReopeningOccupantDetails(): void
    {
        $occupants = [
            ['name' => 'Vikram Seth', 'gender' => 'Male', 'phone' => '9555555551'],
            ['name' => 'Sunita Seth', 'gender' => 'Female', 'phone' => '9555555552'],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9555555551',
            guestName: 'Vikram Seth',
            idProofType: 'Aadhaar',
            idProofNumber: '445566778899',
            city: 'Delhi',
            persons: 2,
            days: 2,
            rate: 1500.00,
            advanceAmount: 800.00,
            advanceMethod: 'upi',
            userId: 1,
            occupants: $occupants,
        );

        $stayId = (int) $stay['id'];

        // Reopen stay details as reception does when viewing an occupied room
        $reopened = $this->stayService->find($stayId, self::HOTEL_ID);

        $this->assertEquals(2, $reopened['persons']);
        $this->assertCount(2, $reopened['occupants']);
        $this->assertEquals('Vikram Seth', $reopened['occupants'][0]['name']);
        $this->assertEquals('Male', $reopened['occupants'][0]['gender']);
        $this->assertEquals('9555555551', $reopened['occupants'][0]['phone']);

        $this->assertEquals('Sunita Seth', $reopened['occupants'][1]['name']);
        $this->assertEquals('Female', $reopened['occupants'][1]['gender']);
        $this->assertEquals('9555555552', $reopened['occupants'][1]['phone']);
    }

    /**
     * Case 9: Viewing uploaded documents.
     */
    public function test09_ViewingUploadedDocuments(): void
    {
        $file = $this->makeDummyFile('pdf', 'aadhaar_scan.pdf');

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9444444441',
            guestName: 'Aarav Patel',
            idProofType: 'Aadhaar',
            idProofNumber: '556677889900',
            city: 'Ahmedabad',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
            documentFiles: [$file],
            occupants: [['name' => 'Aarav Patel', 'gender' => 'Male', 'phone' => '9444444441']],
        );

        $docId = (int) $stay['documents'][0]['id'];

        // Retrieve document file path for authenticated viewing
        $resolved = $this->occupantDocService->getDocumentFilePath(self::HOTEL_ID, $docId);

        $this->assertFileExists($resolved['path']);
        $this->assertEquals('application/pdf', $resolved['mime_type']);
        $this->assertEquals('aadhaar_scan.pdf', $resolved['filename']);
    }

    /**
     * Case 10: Existing reservation Check-In.
     */
    public function test10_ExistingReservationCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9333333331',
            guestName: 'Sneha Kapoor',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 2,
            rate: 1500.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1,
        );

        $resId = (int) $res['id'];

        $occupants = [
            ['name' => 'Sneha Kapoor', 'gender' => 'Female', 'phone' => '9333333331'],
            ['name' => 'Rohan Kapoor', 'gender' => 'Male', 'phone' => '9333333332'],
        ];

        $stay = $this->stayService->checkInFromReservation(
            reservationId: $resId,
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            occupants: $occupants,
        );

        $this->assertEquals(2, $stay['persons']);
        $this->assertCount(2, $stay['occupants']);
        $this->assertEquals('Sneha Kapoor', $stay['occupants'][0]['name']);
        $this->assertEquals('Rohan Kapoor', $stay['occupants'][1]['name']);
        $this->assertEquals(1, $stay['occupants'][0]['is_primary']);
        $this->assertEquals(0, $stay['occupants'][1]['is_primary']);
    }

    /**
     * Case 11: Direct Check-In.
     */
    public function test11_DirectCheckIn(): void
    {
        $occupants = [
            ['name' => 'Gautam Gambhir', 'gender' => 'Male', 'phone' => '9222222221'],
        ];

        $stay = $this->stayService->directCheckIn(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomStandardId,
            guestPhone: '9222222221',
            guestName: 'Gautam Gambhir',
            idProofType: 'Passport',
            idProofNumber: 'Z9876543',
            city: 'Delhi',
            persons: 1,
            days: 1,
            rate: 1500.00,
            advanceAmount: 1500.00,
            advanceMethod: 'card',
            userId: 1,
            occupants: $occupants,
        );

        $this->assertNotEmpty($stay['id']);
        $this->assertEquals('in_house', $stay['status']);
        $this->assertCount(1, $stay['occupants']);
        $this->assertEquals('Gautam Gambhir', $stay['occupants'][0]['name']);
    }

    /**
     * Case 12: Preventing duplicate records on retry.
     */
    public function test12_PreventingDuplicateRecordsOnRetry(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: $this->roomDeluxeId,
            guestPhone: '9111111111',
            guestName: 'Rohit Sharma',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 2,
            rate: 3000.00,
            advanceAmount: 1000.00,
            advanceMethod: 'upi',
            userId: 1,
        );

        $resId = (int) $res['id'];

        $occupants = [
            ['name' => 'Rohit Sharma', 'gender' => 'Male', 'phone' => '9111111111'],
            ['name' => 'Ritika Sajdeh', 'gender' => 'Female', 'phone' => '9111111112'],
        ];

        // 1st Check-In
        $firstStay = $this->stayService->checkInFromReservation(
            reservationId: $resId,
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            occupants: $occupants,
        );

        $firstStayId = (int) $firstStay['id'];

        // 2nd Check-In (Retry attempt)
        $retryStay = $this->stayService->checkInFromReservation(
            reservationId: $resId,
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            occupants: $occupants,
        );

        // Must return the existing stay without duplicating
        $this->assertEquals($firstStayId, (int) $retryStay['id']);

        // Verify database has strictly 1 stay and strictly 2 occupants for this reservation
        $stmtStay = $this->db->prepare("SELECT COUNT(*) FROM stays WHERE reservation_id = :res_id");
        $stmtStay->execute(['res_id' => $resId]);
        $this->assertEquals(1, (int) $stmtStay->fetchColumn());

        $stmtOcc = $this->db->prepare("SELECT COUNT(*) FROM occupants WHERE stay_id = :stay_id");
        $stmtOcc->execute(['stay_id' => $firstStayId]);
        $this->assertEquals(2, (int) $stmtOcc->fetchColumn());
    }
}

