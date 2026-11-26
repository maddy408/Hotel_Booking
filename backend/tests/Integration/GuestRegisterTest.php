<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Controller\GuestController;
use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\ReservationRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\GuestService;
use App\Support\AuditLogger;
use App\Support\IdImageUploader;
use PDO;
use PHPUnit\Framework\TestCase;

final class GuestRegisterTest extends TestCase
{
    private PDO $db;
    private GuestRepository $guestRepo;
    private GuestController $controller;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->guestRepo = new GuestRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $resRepo = new ReservationRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $guestService = new GuestService($this->guestRepo, new IdImageUploader(dirname(__DIR__, 2) . '/storage/uploads'), $audit);
        $this->controller = new GuestController($this->guestRepo, $guestService, $stayRepo, $resRepo);
    }

    public function testRegisterReturnsCleanList(): void
    {
        $req = new Request('GET', '/guests', [], [], [], '127.0.0.1');
        $req->setAttribute('hotelId', 1);
        $req->setAttribute('userId', 1);

        $results = $this->controller->index($req);
        $this->assertIsArray($results);
        $this->assertNotEmpty($results);

        $byGuestId = [];
        foreach ($results as $item) {
            $byGuestId[$item['id']] = $item;
        }

        // 1. A guest staying with two occupants (Kalai - ID 27)
        if (isset($byGuestId[27])) {
            $kalai = $byGuestId[27];
            $this->assertSame('In-House', $kalai['status']);
            $this->assertSame(102, $kalai['room']);
            $this->assertSame(2, $kalai['persons']);
            $this->assertCount(2, $kalai['occupants']);
            $this->assertSame('Kalai', $kalai['occupants'][0]['name']);
            $this->assertTrue($kalai['occupants'][0]['is_primary']);
            $this->assertSame('Primary Guest', $kalai['occupants'][0]['role']);
            $this->assertSame('Senthil', $kalai['occupants'][1]['name']);
            $this->assertFalse($kalai['occupants'][1]['is_primary']);
            $this->assertSame('Additional Occupant', $kalai['occupants'][1]['role']);
            // Referred by John Doe (100471)
            $this->assertNotNull($kalai['referredBy']);
            $this->assertSame(100471, $kalai['referredBy']['id']);
            $this->assertSame('John Doe', $kalai['referredBy']['name']);
        }

        // 2. A guest with an upcoming booking (Maya - ID 101072)
        if (isset($byGuestId[101072])) {
            $maya = $byGuestId[101072];
            $this->assertSame('Booked', $maya['status']);
            $this->assertSame(102, $maya['room']);
            $this->assertSame(2, $maya['persons']);
            $this->assertSame('not_added_yet', $maya['occupantsStatus']);
            $this->assertEmpty($maya['occupants']);
        }

        // 3. A guest with a completed stay (Eeswaran - ID 101208)
        if (isset($byGuestId[101208])) {
            $eeswaran = $byGuestId[101208];
            $this->assertSame('Checked Out', $eeswaran['status']);
            $this->assertSame(101, $eeswaran['room']); // Room from most recent completed stay
            $this->assertNull($eeswaran['now']); // Historical room is not an active in-house stay
            $this->assertSame(2, $eeswaran['persons']);
            $this->assertNotEmpty($eeswaran['occupants']);
            $this->assertGreaterThanOrEqual(1, $eeswaran['visits']);
        }

        // 4. A guest with no booking or stay (Social Guest - ID 104905)
        if (isset($byGuestId[104905])) {
            $social = $byGuestId[104905];
            $this->assertSame('Not Staying', $social['status']);
            $this->assertNull($social['room']);
            $this->assertNull($social['persons']);
            $this->assertEmpty($social['occupants']);
            $this->assertNull($social['referredBy']);
            $this->assertSame(0, $social['visits']);
        }

        // 5. A guest referred by another existing guest (Gayu - ID 104718 referred by Kalai - ID 27)
        if (isset($byGuestId[104718])) {
            $gayu = $byGuestId[104718];
            $this->assertNotNull($gayu['referredBy']);
            $this->assertSame(27, $gayu['referredBy']['id']);
            $this->assertSame('Kalai', $gayu['referredBy']['name']);
        }
    }

    public function testRoomDisplayAcrossAllGuestStatusesAndHistories(): void
    {
        $hotelId = 1;
        $cleanIds = [];

        try {
            // Helper to find a room ID by room_no
            $roomLookup = function (int $roomNo): int {
                $stmt = $this->db->prepare('SELECT id FROM rooms WHERE room_no = :no AND hotel_id = 1 LIMIT 1');
                $stmt->execute(['no' => $roomNo]);
                $id = $stmt->fetchColumn();
                return (int) $id;
            };

            $roomId101 = $roomLookup(101);
            $roomId102 = $roomLookup(102);
            $roomId103 = $roomLookup(103);
            $roomId104 = $roomLookup(104);
            $roomId105 = $roomLookup(105);

            // 1. In-House guest
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test In-House Guest', '9900000001')");
            $gInHouseId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gInHouseId;
            $this->db->exec("INSERT INTO stays (hotel_id, guest_id, room_id, check_in_date, checkout_planned, status, persons, rate, created_by) VALUES (1, {$gInHouseId}, {$roomId102}, '2026-11-26', '2026-11-28', 'in_house', 1, 1000.00, 1)");
            $cleanIds['stays'][] = (int) $this->db->lastInsertId();

            // 2. Upcoming booked guest
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test Booked Guest', '9900000002')");
            $gBookedId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gBookedId;
            $this->db->exec("INSERT INTO reservations (hotel_id, guest_id, room_id, booking_code, check_in_date, check_out_date, status, persons, rate, advance_amount, created_by) VALUES (1, {$gBookedId}, {$roomId105}, 'BK-TEST-02', '2026-11-29', '2026-12-01', 'pending', 2, 1200.00, 500.00, 1)");
            $cleanIds['reservations'][] = (int) $this->db->lastInsertId();

            // 3. Checked-out guest
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test Checked-Out Guest', '9900000003')");
            $gCheckedOutId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gCheckedOutId;
            $this->db->exec("INSERT INTO stays (hotel_id, guest_id, room_id, check_in_date, checkout_planned, checkout_actual, status, persons, rate, created_by) VALUES (1, {$gCheckedOutId}, {$roomId103}, '2026-11-20', '2026-11-22', '2026-11-22', 'checked_out', 1, 1000.00, 1)");
            $cleanIds['stays'][] = (int) $this->db->lastInsertId();

            // 4. Guest with multiple historical stays in different rooms (Room 101 then Room 104)
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test Multi-Stay Guest', '9900000004')");
            $gMultiStayId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gMultiStayId;
            $this->db->exec("INSERT INTO stays (hotel_id, guest_id, room_id, check_in_date, checkout_planned, checkout_actual, status, persons, rate, created_by) VALUES (1, {$gMultiStayId}, {$roomId101}, '2026-10-01', '2026-10-03', '2026-10-03', 'checked_out', 1, 1000.00, 1)");
            $cleanIds['stays'][] = (int) $this->db->lastInsertId();
            $this->db->exec("INSERT INTO stays (hotel_id, guest_id, room_id, check_in_date, checkout_planned, checkout_actual, status, persons, rate, created_by) VALUES (1, {$gMultiStayId}, {$roomId104}, '2026-11-10', '2026-11-15', '2026-11-15', 'checked_out', 2, 1500.00, 1)");
            $cleanIds['stays'][] = (int) $this->db->lastInsertId();

            // 5. Guest with cancelled booking only
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test Cancelled Only Guest', '9900000005')");
            $gCancelledId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gCancelledId;
            $this->db->exec("INSERT INTO reservations (hotel_id, guest_id, room_id, booking_code, check_in_date, check_out_date, status, persons, rate, advance_amount, created_by) VALUES (1, {$gCancelledId}, {$roomId101}, 'BK-TEST-05', '2026-11-25', '2026-11-27', 'cancelled', 1, 1000.00, 0.00, 1)");
            $cleanIds['reservations'][] = (int) $this->db->lastInsertId();

            // 6. Guest with no booking or stay history
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test No-History Guest', '9900000006')");
            $gNoHistoryId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gNoHistoryId;

            // 7. Guest with completed stay and subsequent cancelled booking
            $this->db->exec("INSERT INTO guests (hotel_id, name, phone) VALUES (1, 'Test Stay Then Cancelled Guest', '9900000007')");
            $gStayThenCancelId = (int) $this->db->lastInsertId();
            $cleanIds['guests'][] = $gStayThenCancelId;
            $this->db->exec("INSERT INTO stays (hotel_id, guest_id, room_id, check_in_date, checkout_planned, checkout_actual, status, persons, rate, created_by) VALUES (1, {$gStayThenCancelId}, {$roomId101}, '2026-09-01', '2026-09-05', '2026-09-05', 'checked_out', 1, 1000.00, 1)");
            $cleanIds['stays'][] = (int) $this->db->lastInsertId();
            $this->db->exec("INSERT INTO reservations (hotel_id, guest_id, room_id, booking_code, check_in_date, check_out_date, status, persons, rate, advance_amount, created_by) VALUES (1, {$gStayThenCancelId}, {$roomId102}, 'BK-TEST-07', '2026-11-20', '2026-11-22', 'cancelled', 1, 1000.00, 0.00, 1)");
            $cleanIds['reservations'][] = (int) $this->db->lastInsertId();

            // Query register
            $req = new Request('GET', '/guests', [], [], [], '127.0.0.1');
            $req->setAttribute('hotelId', $hotelId);
            $req->setAttribute('userId', 1);

            $results = $this->controller->index($req);
            $byGuestId = [];
            foreach ($results as $item) {
                $byGuestId[$item['id']] = $item;
            }

            // Verification 1: In-House guest displays current occupied room
            $this->assertArrayHasKey($gInHouseId, $byGuestId);
            $inHouseGuest = $byGuestId[$gInHouseId];
            $this->assertSame('In-House', $inHouseGuest['status']);
            $this->assertSame('in_house', $inHouseGuest['statusKey']);
            $this->assertSame(102, $inHouseGuest['room']);
            $this->assertSame(102, $inHouseGuest['room_no']);
            $this->assertNotNull($inHouseGuest['now']);
            $this->assertSame(102, $inHouseGuest['now']['roomNo']);

            // Verification 2: Upcoming booked guest displays reserved room
            $this->assertArrayHasKey($gBookedId, $byGuestId);
            $bookedGuest = $byGuestId[$gBookedId];
            $this->assertSame('Booked', $bookedGuest['status']);
            $this->assertSame('booked', $bookedGuest['statusKey']);
            $this->assertSame(105, $bookedGuest['room']);
            $this->assertSame(105, $bookedGuest['room_no']);

            // Verification 3: Checked-out guest displays room from most recent completed stay
            $this->assertArrayHasKey($gCheckedOutId, $byGuestId);
            $checkedOutGuest = $byGuestId[$gCheckedOutId];
            $this->assertSame('Checked Out', $checkedOutGuest['status']);
            $this->assertSame('checked_out', $checkedOutGuest['statusKey']);
            $this->assertSame(103, $checkedOutGuest['room']);
            $this->assertSame(103, $checkedOutGuest['room_no']);
            $this->assertNull($checkedOutGuest['now']); // Historical room is not current occupied room
            $this->assertEmpty($checkedOutGuest['additionalRooms']);

            // Verification 4: Guest with multiple historical stays displays the MOST RECENT room (104, not 101)
            $this->assertArrayHasKey($gMultiStayId, $byGuestId);
            $multiStayGuest = $byGuestId[$gMultiStayId];
            $this->assertSame('Checked Out', $multiStayGuest['status']);
            $this->assertSame('checked_out', $multiStayGuest['statusKey']);
            $this->assertSame(104, $multiStayGuest['room']);
            $this->assertSame(104, $multiStayGuest['room_no']);
            $this->assertNull($multiStayGuest['now']);

            // Verification 5: Guest with cancelled booking only displays NO room (null / —)
            $this->assertArrayHasKey($gCancelledId, $byGuestId);
            $cancelledGuest = $byGuestId[$gCancelledId];
            $this->assertSame('Cancelled', $cancelledGuest['status']);
            $this->assertSame('cancelled', $cancelledGuest['statusKey']);
            $this->assertNull($cancelledGuest['room']);
            $this->assertNull($cancelledGuest['room_no']);
            $this->assertNull($cancelledGuest['now']);

            // Verification 6: Guest with no booking or stay history displays NO room (null / —)
            $this->assertArrayHasKey($gNoHistoryId, $byGuestId);
            $noHistoryGuest = $byGuestId[$gNoHistoryId];
            $this->assertSame('Not Staying', $noHistoryGuest['status']);
            $this->assertSame('not_staying', $noHistoryGuest['statusKey']);
            $this->assertNull($noHistoryGuest['room']);
            $this->assertNull($noHistoryGuest['room_no']);
            $this->assertNull($noHistoryGuest['now']);

            // Verification 7: Cancelled bookings do not incorrectly display a previous stay room
            $this->assertArrayHasKey($gStayThenCancelId, $byGuestId);
            $stayThenCancelGuest = $byGuestId[$gStayThenCancelId];
            $this->assertSame('Cancelled', $stayThenCancelGuest['status']);
            $this->assertNull($stayThenCancelGuest['room']);
            $this->assertNull($stayThenCancelGuest['room_no']);

            // Verification 8: Search by room number finds historical and active guests
            $roomSearchResults = $this->guestRepo->search($hotelId, '103');
            $searchGuestIds = array_column($roomSearchResults, 'id');
            $this->assertContains($gCheckedOutId, $searchGuestIds, 'Room search for 103 should find guest who stayed in 103');

        } finally {
            // Cleanup test data
            if (!empty($cleanIds['stays'])) {
                $ids = implode(',', $cleanIds['stays']);
                $this->db->exec("DELETE FROM stays WHERE id IN ({$ids})");
            }
            if (!empty($cleanIds['reservations'])) {
                $ids = implode(',', $cleanIds['reservations']);
                $this->db->exec("DELETE FROM reservations WHERE id IN ({$ids})");
            }
            if (!empty($cleanIds['guests'])) {
                $ids = implode(',', $cleanIds['guests']);
                $this->db->exec("DELETE FROM guests WHERE id IN ({$ids})");
            }
        }
    }
}
