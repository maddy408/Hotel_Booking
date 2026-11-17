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

final class PreCheckInVerificationAndConsecutiveBookingsTest extends TestCase
{
    private const HOTEL_ID = 998;
    private const ROOM_409_ID = 998409;

    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private OccupantDocumentService $occupantDocService;
    private OccupantDocumentUploader $uploader;
    private string $tempDir;
    private array $createdTempFiles = [];

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->cleanup();

        $this->tempDir = sys_get_temp_dir() . '/tc_precheckin_test_' . bin2hex(random_bytes(4));
        if (!is_dir($this->tempDir)) {
            mkdir($this->tempDir, 0777, true);
        }
        $this->uploader = new OccupantDocumentUploader($this->tempDir);

        // Hotel 998 setup
        $this->db->exec("INSERT INTO hotels (id, name, place) VALUES (" . self::HOTEL_ID . ", 'Grand Hotel 998', 'Pondicherry')");
        $this->db->exec("INSERT INTO settings (hotel_id, invoice_prefix, checkout_hour, timezone) VALUES (" . self::HOTEL_ID . ", 'PRE998', 12, 'Asia/Kolkata')");

        // Room Type (max 2 persons)
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (9981, " . self::HOTEL_ID . ", 'DLX', 'Deluxe Room', 2000.00, 2)");

        // Room 409
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id, housekeeping_status) VALUES (" . self::ROOM_409_ID . ", " . self::HOTEL_ID . ", 409, 4, 9981, 'ok')");

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
            null,
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
        $this->db->exec('DELETE FROM occupant_documents WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM occupants WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM payments WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM stays WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM reservations WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM rooms WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM room_types WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM guests WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM settings WHERE hotel_id = ' . self::HOTEL_ID);
        $this->db->exec('DELETE FROM hotels WHERE id = ' . self::HOTEL_ID);
    }

    private function removeDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $files = array_diff(scandir($dir) ?: [], ['.', '..']);
        foreach ($files as $f) {
            $path = "$dir/$f";
            is_dir($path) ? $this->removeDirectory($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    private function makeDummyFile(string $ext, string $origName = 'test.pdf'): array
    {
        $path = tempnam($this->tempDir, 'id_');
        $this->createdTempFiles[] = $path;
        file_put_contents($path, "%PDF-1.4 test document content for $origName");
        $mime = $ext === 'pdf' ? 'application/pdf' : 'image/jpeg';
        return [
            'tmp_name' => $path,
            'name' => $origName,
            'size' => filesize($path),
            'error' => UPLOAD_ERR_OK,
            'type' => $mime,
        ];
    }

    /**
     * Requirement 7: Verify every occupant has at least one valid ID proof document.
     * When verifyDocuments is enabled, missing an ID proof for an occupant must fail check-in.
     */
    public function testVerifyEveryOccupantHasIdProofFailsWhenOneIsMissing(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9888888881',
            guestName: 'Arjun Das',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 2,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1
        );

        $file1 = $this->makeDummyFile('pdf', 'arjun_aadhaar.pdf');

        $occupants = [
            ['name' => 'Arjun Das', 'gender' => 'Male', 'phone' => '9888888881'],
            ['name' => 'Meera Das', 'gender' => 'Female', 'phone' => '9888888882'],
        ];

        // File 1 is assigned only to Person 1 (index 0). Person 2 (index 1) has no document.
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Every occupant must have at least one valid ID proof document');

        $this->stayService->checkInFromReservation(
            reservationId: (int) $res['id'],
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            documentFiles: [$file1],
            occupantTargetIndexes: [0], // Only Person 1
            occupants: $occupants,
            verifyDocuments: true,
        );
    }

    /**
     * Requirement 6 & 7: Multiple documents for same occupant and all occupants verified.
     * Person 1 has 2 documents (front & back), Person 2 has 1 document. All pass!
     */
    public function testCheckInSucceedsWhenAllOccupantsHaveIdProofAndAllowsMultipleDocsPerOccupant(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9888888881',
            guestName: 'Arjun Das',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 2,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1
        );

        $file1 = $this->makeDummyFile('pdf', 'arjun_aadhaar_front.pdf');
        $file2 = $this->makeDummyFile('pdf', 'arjun_aadhaar_back.pdf');
        $file3 = $this->makeDummyFile('jpg', 'meera_license.jpg');

        $occupants = [
            ['name' => 'Arjun Das', 'gender' => 'Male', 'phone' => '9888888881'],
            ['name' => 'Meera Das', 'gender' => 'Female', 'phone' => '9888888882'],
        ];

        // File 1 & 2 assigned to Person 1 (index 0). File 3 assigned to Person 2 (index 1).
        $stay = $this->stayService->checkInFromReservation(
            reservationId: (int) $res['id'],
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            documentFiles: [$file1, $file2, $file3],
            occupantTargetIndexes: [0, 0, 1],
            occupants: $occupants,
            verifyDocuments: true,
        );

        $this->assertEquals(2, $stay['persons']);
        $this->assertCount(2, $stay['occupants']);
        $this->assertCount(3, $stay['documents']);

        // Check documents linked to occupants
        $occ1 = $stay['occupants'][0];
        $occ2 = $stay['occupants'][1];
        $this->assertCount(2, $occ1['documents']);
        $this->assertCount(1, $occ2['documents']);

        // Verify stay_id, hotel_id, and reservation_id in documents table
        foreach ($stay['documents'] as $doc) {
            $this->assertEquals(self::HOTEL_ID, (int) $doc['hotel_id']);
            $this->assertEquals((int) $stay['id'], (int) $doc['stay_id']);
            $this->assertEquals((int) $res['id'], (int) $doc['reservation_id']);
        }
    }

    /**
     * Requirement 5: Assigning pre-booking documents to occupants at check-in.
     */
    public function testPreBookingDocumentAssignedToOccupantAtCheckIn(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));

        $preFile = $this->makeDummyFile('pdf', 'pre_uploaded_aadhaar.pdf');

        $res = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9777777777',
            guestName: 'Karan Mehra',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 2,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'upi',
            userId: 1,
            documentFiles: [$preFile]
        );

        $preDocs = $this->occupantDocService->getDocumentsForReservation(self::HOTEL_ID, (int) $res['id']);
        $this->assertCount(1, $preDocs);
        $preDocId = (int) $preDocs[0]['id'];

        // At check-in, assign pre-booking document to Person 1, and upload a new document for Person 2
        $newFile = $this->makeDummyFile('jpg', 'person2_passport.jpg');
        $occupants = [
            ['name' => 'Karan Mehra', 'gender' => 'Male', 'phone' => '9777777777'],
            ['name' => 'Nisha Mehra', 'gender' => 'Female', 'phone' => '9777777778'],
        ];

        $stay = $this->stayService->checkInFromReservation(
            reservationId: (int) $res['id'],
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 2,
            documentFiles: [$newFile],
            occupantTargetIndexes: [1], // newFile -> Person 2
            occupants: $occupants,
            verifyDocuments: true,
            preBookingDocAssignments: [$preDocId => 0] // preDoc -> Person 1
        );

        $this->assertCount(2, $stay['documents']);
        $this->assertCount(1, $stay['occupants'][0]['documents']);
        $this->assertCount(1, $stay['occupants'][1]['documents']);
    }

    /**
     * Additional Requirement: Consecutive Bookings (15–16 Nov and 16–17 Nov in Room 409).
     * Half-open reservation overlap rule allows consecutive bookings.
     * When Guest A does not arrive:
     * - Kept as Not Came until arrival deadline.
     * - Premature no-show is prevented.
     * - After arrival date passes, markNoShow succeeds.
     * - No stay is created for no-show; room is not marked occupied; room is not sent to cleaning.
     * - Booking B arrives on 16 Nov and checks in normally.
     */
    public function testConsecutiveBookingsAndNoShowHandling(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        // 1. Create Booking A for today -> tomorrow
        $resA = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9555555551',
            guestName: 'Guest A',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 1,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1
        );

        // 2. Create consecutive Booking B for the exact same room: tomorrow -> dayAfter
        $resB = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9555555552',
            guestName: 'Guest B',
            checkIn: $tomorrow,
            checkOut: $dayAfter,
            persons: 1,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'upi',
            userId: 1
        );

        $this->assertEquals('pending', $resA['status']);
        $this->assertEquals('pending', $resB['status']);

        // Check room status before any check-in
        $roomStmt = $this->db->prepare('SELECT housekeeping_status FROM rooms WHERE id = :id');
        $roomStmt->execute(['id' => self::ROOM_409_ID]);
        $this->assertEquals('ok', $roomStmt->fetchColumn());

        // Premature no-show check: Since arrival date of A is today, A cannot be marked no-show prematurely.
        try {
            $this->reservationService->markNoShow((int) $resA['id'], self::HOTEL_ID, 1);
            $this->fail('Premature no-show should have thrown an exception.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('The arrival date has not passed yet', $e->getMessage());
        }

        // Now simulate that the arrival date has passed (e.g. Guest A never showed up, date passed)
        $pastDate = date('Y-m-d', strtotime('-2 days'));
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $this->db->prepare("UPDATE reservations SET check_in_date = :cin, check_out_date = :cout WHERE id = :id")
            ->execute(['cin' => $pastDate, 'cout' => $yesterday, 'id' => $resA['id']]);

        // After arrival date has passed, mark it No-Show
        $noShowResA = $this->reservationService->markNoShow((int) $resA['id'], self::HOTEL_ID, 1);
        $this->assertEquals('no_show', $noShowResA['status']);

        // Verify No stay was created for Guest A
        $stayStmt = $this->db->prepare('SELECT COUNT(*) FROM stays WHERE reservation_id = :id');
        $stayStmt->execute(['id' => $resA['id']]);
        $this->assertEquals(0, (int) $stayStmt->fetchColumn());

        // Verify Room was NOT marked occupied and NOT sent to cleaning
        $roomStmt->execute(['id' => self::ROOM_409_ID]);
        $this->assertEquals('ok', $roomStmt->fetchColumn());

        // Now Booking B arrives on its check-in date: Update Booking B to today so it can check in
        $this->db->prepare("UPDATE reservations SET check_in_date = :cin, check_out_date = :cout WHERE id = :id")
            ->execute(['cin' => $today, 'cout' => $tomorrow, 'id' => $resB['id']]);

        // Verify Booking B is NOT blocked by Booking A (which was no-show) and can check in
        $fileB = $this->makeDummyFile('pdf', 'guest_b_id.pdf');
        $occupantsB = [
            ['name' => 'Guest B', 'gender' => 'Male', 'phone' => '9555555552'],
        ];

        $stayB = $this->stayService->checkInFromReservation(
            reservationId: (int) $resB['id'],
            hotelId: self::HOTEL_ID,
            userId: 1,
            persons: 1,
            documentFiles: [$fileB],
            occupants: $occupantsB,
            verifyDocuments: true
        );

        $this->assertEquals(1, $stayB['persons']);
        $this->assertEquals('in_house', $stayB['status']);
        $this->assertEquals((int) $resB['id'], (int) $stayB['reservation_id']);
    }

    /**
     * Additional Requirement: Late Arrival Conflict
     * If Guest A arrives on/after original checkout date and another reservation already starts on that date:
     * - Do not automatically check Guest A into the room.
     * - Throw conflict error explaining the clash with next reservation.
     * - Revalidate room availability on the backend.
     * - Never overwrite or silently cancel the next guest's reservation.
     */
    public function testLateArrivalConflictPreventsOverwritingNextReservation(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));

        // Booking A was created when today was future, e.g. originally 1 night
        $resA = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9444444441',
            guestName: 'Late Guest A',
            checkIn: $today,
            checkOut: $tomorrow,
            persons: 1,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'cash',
            userId: 1
        );

        // Booking B was created for the consecutive slot: tomorrow -> dayAfter
        $resB = $this->reservationService->create(
            hotelId: self::HOTEL_ID,
            roomId: self::ROOM_409_ID,
            guestPhone: '9444444442',
            guestName: 'Next Guest B',
            checkIn: $tomorrow,
            checkOut: $dayAfter,
            persons: 1,
            rate: 2000.00,
            advanceAmount: 500.00,
            advanceMethod: 'upi',
            userId: 1
        );

        // Simulate time advancing: Booking A was originally yesterday -> today, and Booking B is today -> tomorrow
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $this->db->prepare("UPDATE reservations SET check_in_date = :cin, check_out_date = :cout WHERE id = :id")
            ->execute(['cin' => $yesterday, 'cout' => $today, 'id' => $resA['id']]);
        $this->db->prepare("UPDATE reservations SET check_in_date = :cin, check_out_date = :cout WHERE id = :id")
            ->execute(['cin' => $today, 'cout' => $tomorrow, 'id' => $resB['id']]);

        // Guest A arrives late today ($today >= original checkout date $today).
        // If checked in today for 1 night, Guest A needs Room 409 from $today to $tomorrow.
        // But Room 409 is already reserved by Next Guest B ($today to $tomorrow)!
        $fileA = $this->makeDummyFile('pdf', 'late_guest_a.pdf');
        $occupantsA = [
            ['name' => 'Late Guest A', 'gender' => 'Male', 'phone' => '9444444441'],
        ];

        try {
            $this->stayService->checkInFromReservation(
                reservationId: (int) $resA['id'],
                hotelId: self::HOTEL_ID,
                userId: 1,
                persons: 1,
                documentFiles: [$fileA],
                occupants: $occupantsA,
                verifyDocuments: true
            );
            $this->fail('Late arrival conflict should have thrown an exception.');
        } catch (ApiException $e) {
            $this->assertStringContainsString('Late arrival conflict', $e->getMessage());
            $this->assertStringContainsString('Next Guest B', $e->getMessage());
        }

        // Verify Next Guest B's reservation was NOT overwritten or cancelled
        $checkB = $this->reservationService->find((int) $resB['id'], self::HOTEL_ID);
        $this->assertEquals('pending', $checkB['status']);
        $this->assertEquals('Next Guest B', $checkB['guest_name']);
    }
}
