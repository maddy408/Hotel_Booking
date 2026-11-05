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
        $roomId = $this->roomId(102); // in-house in the seed, out ~ today+1
        $today = date('Y-m-d');
        $tomorrow = (new \DateTimeImmutable($today))->modify('+1 day')->format('Y-m-d');
        $this->assertFalse($this->service->isFree($roomId, $today, $tomorrow));
    }

    public function testSameDayTurnoverDoesNotConflict(): void
    {
        // Room 204's finished stay ended well in the past; a new range starting
        // on its own checkout day must not be treated as overlapping (half-open interval).
        $roomId = $this->roomId(305); // in-house, out = today+1 in the seed
        $stmt = $this->db->prepare('SELECT checkout_planned FROM stays WHERE room_id = :id AND status = \'in_house\'');
        $stmt->execute(['id' => $roomId]);
        $plannedOut = $stmt->fetchColumn();

        $dayAfter = (new \DateTimeImmutable($plannedOut))->modify('+2 day')->format('Y-m-d');
        $this->assertTrue($this->service->isFree($roomId, $plannedOut, $dayAfter));
    }

    public function testPendingBookingBlocksItsOwnDateRange(): void
    {
        $roomId = $this->roomId(103); // BK-1001 pending, today -> today+2
        $today = date('Y-m-d');
        $tomorrow = (new \DateTimeImmutable($today))->modify('+1 day')->format('Y-m-d');
        $this->assertFalse($this->service->isFree($roomId, $today, $tomorrow));
    }

    public function testExcludingItsOwnReservationMakesItsOwnRangeFreeAgain(): void
    {
        $roomId = $this->roomId(103);
        $stmt = $this->db->prepare("SELECT id, check_in_date, check_out_date FROM reservations WHERE room_id = :id AND status = 'pending'");
        $stmt->execute(['id' => $roomId]);
        $res = $stmt->fetch(PDO::FETCH_ASSOC);

        $this->assertTrue($this->service->isFree($roomId, $res['check_in_date'], $res['check_out_date'], excludeReservationId: (int) $res['id']));
    }

    private function roomId(int $roomNo): int
    {
        $stmt = $this->db->prepare('SELECT id FROM rooms WHERE hotel_id = 1 AND room_no = :no');
        $stmt->execute(['no' => $roomNo]);
        return (int) $stmt->fetchColumn();
    }
}
