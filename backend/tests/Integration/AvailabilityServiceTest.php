<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\ReservationRepository;
use App\Repository\StayRepository;
use App\Service\AvailabilityService;
use PDO;
use PHPUnit\Framework\TestCase;

/** Overlap rules, run against the real DB inside a rolled-back transaction. */
final class AvailabilityServiceTest extends TestCase
{
    private PDO $db;
    private AvailabilityService $service;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->db->beginTransaction();
        $this->service = new AvailabilityService(new ReservationRepository($this->db), new StayRepository($this->db));
    }

    protected function tearDown(): void
    {
        if ($this->db->inTransaction()) {
            $this->db->rollBack();
        }
    }

    public function testRoomWithNoBookingsIsFree(): void
    {
        $roomId = $this->roomId(304); // free in the seed
        $this->assertTrue($this->service->isFree($roomId, '2026-12-01', '2026-12-03'));
    }

    public function testOccupiedRoomBlocksAnOverlappingRange(): void
    {
        $stmt = $this->db->query("SELECT room_id, check_in_date, checkout_planned FROM stays WHERE hotel_id = 1 AND status = 'in_house' LIMIT 1");
        $stay = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$stay) {
            $roomId = $this->roomId(101);
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $today = date('Y-m-d');
            $tomorrow = date('Y-m-d', strtotime('+1 day'));
            $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 2000, :cin, :cout, 'in_house')")
                ->execute(['r' => $roomId, 'g' => $guestId, 'cin' => $today, 'cout' => $tomorrow]);
            $stay = ['room_id' => $roomId, 'check_in_date' => $today, 'checkout_planned' => $tomorrow];
        }
        $this->assertNotEmpty($stay);
        // An overlapping range within the stay must be blocked
        $this->assertFalse($this->service->isFree((int) $stay['room_id'], $stay['check_in_date'], $stay['checkout_planned']));
    }

    public function testSameDayTurnoverDoesNotConflict(): void
    {
        // A new range starting on checkout day must not be treated as overlapping (half-open interval).
        $roomId = $this->roomId(304); // Clean room with no existing bookings
        $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
        $today = date('Y-m-d');
        $plannedOut = date('Y-m-d', strtotime('+1 day'));
        $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 2000, :cin, :cout, 'in_house')")
            ->execute(['r' => $roomId, 'g' => $guestId, 'cin' => $today, 'cout' => $plannedOut]);

        $dayAfter = (new \DateTimeImmutable($plannedOut))->modify('+2 day')->format('Y-m-d');
        $this->assertTrue($this->service->isFree($roomId, $plannedOut, $dayAfter));
    }

    public function testPendingBookingBlocksItsOwnDateRange(): void
    {
        // Find a room with an actual pending reservation
        $stmt = $this->db->query("SELECT room_id, check_in_date, check_out_date FROM reservations WHERE hotel_id = 1 AND status = 'pending' LIMIT 1");
        $res = $stmt->fetch(PDO::FETCH_ASSOC);
        $this->assertNotEmpty($res);
        $this->assertFalse($this->service->isFree((int) $res['room_id'], $res['check_in_date'], $res['check_out_date']));
    }

    public function testExcludingItsOwnReservationMakesItsOwnRangeFreeAgain(): void
    {
        $roomId = $this->roomId(103);
        $stmt = $this->db->prepare("SELECT id, check_in_date, check_out_date FROM reservations WHERE room_id = :id AND status = 'pending'");
        $stmt->execute(['id' => $roomId]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$res) {
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $this->db->prepare("INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, status, rate) VALUES (1, 'TEST-BK', :room_id, :guest_id, '2026-12-10', '2026-12-12', 'pending', 2000)")
                ->execute(['room_id' => $roomId, 'guest_id' => $guestId]);
            $res = [
                'id' => (int) $this->db->lastInsertId(),
                'check_in_date' => '2026-12-10',
                'check_out_date' => '2026-12-12',
            ];
        }

        $this->assertTrue($this->service->isFree($roomId, $res['check_in_date'], $res['check_out_date'], excludeReservationId: (int) $res['id']));
    }

    private function roomId(int $roomNo): int
    {
        $stmt = $this->db->prepare('SELECT id FROM rooms WHERE hotel_id = 1 AND room_no = :no');
        $stmt->execute(['no' => $roomNo]);
        return (int) $stmt->fetchColumn();
    }
}
