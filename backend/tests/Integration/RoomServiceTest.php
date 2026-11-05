<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Service\RoomService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * Hits the real local database inside a transaction that is always rolled back,
 * so seed data is left untouched. Requires backend/.env to point at a reachable DB.
 */
final class RoomServiceTest extends TestCase
{
    private PDO $db;
    private RoomService $service;
    private const HOTEL_ID = 1;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->db->beginTransaction();
        $this->service = new RoomService(
            new RoomRepository($this->db),
            new RoomTypeRepository($this->db),
            new HousekeepingLogRepository($this->db),
            new AuditLogger(new AuditLogRepository($this->db)),
        );
    }

    protected function tearDown(): void
    {
        if ($this->db->inTransaction()) {
            $this->db->rollBack();
        }
    }

    public function testBulkAddRejectsRangeOverSixtyRooms(): void
    {
        $this->expectException(ApiException::class);
        $this->service->bulkAddRooms(self::HOTEL_ID, 9, 900, 900 + 61, 1);
    }

    public function testBulkAddSkipsRoomsThatAlreadyExist(): void
    {
        $result = $this->service->bulkAddRooms(self::HOTEL_ID, 9, 901, 903, 1);
        $this->assertSame(3, $result['added']);

        $result2 = $this->service->bulkAddRooms(self::HOTEL_ID, 9, 902, 904, 1);
        $this->assertSame(1, $result2['added']); // only 904 is new
        $this->assertSame([902, 903], $result2['skipped']);
    }

    public function testDeleteRoomBlockedWhileALiveStayReferencesIt(): void
    {
        // Room 102 has an in-house stay in the seed data.
        $room = $this->fetchRoomByNo(102);
        $this->expectException(ApiException::class);
        $this->service->deleteRoom((int) $room['id'], self::HOTEL_ID, 1);
    }

    public function testDeleteRoomTypeBlockedWhileRoomsUseIt(): void
    {
        $this->expectException(ApiException::class);
        $this->service->deleteRoomType(1, self::HOTEL_ID); // STD, has rooms in the seed
    }

    public function testRepairRoomCannotGoDirectlyToReady(): void
    {
        $room = $this->fetchRoomByNo(407); // seeded under repair
        $this->expectException(ApiException::class);
        $this->service->setHousekeeping((int) $room['id'], 'ready', null, 1, self::HOTEL_ID);
    }

    public function testRepairRoomCanGoToCleaning(): void
    {
        $room = $this->fetchRoomByNo(407);
        $updated = $this->service->setHousekeeping((int) $room['id'], 'cleaning', null, 1, self::HOTEL_ID);
        $this->assertSame('cleaning', $updated['housekeeping_status']);
    }

    public function testRoomFromAnotherHotelCannotBeMutatedOrDeleted(): void
    {
        // Simulate a second tenant and confirm hotel 1's JWT can't reach into it (broken-access-control check).
        $this->db->exec("INSERT INTO hotels (id, name) VALUES (999, 'Other Hotel')");
        $this->db->exec("INSERT INTO settings (hotel_id) VALUES (999)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (999, 999, 'STD', 'Standard', 1000, 2)");
        $this->db->exec("INSERT INTO rooms (id, hotel_id, room_no, floor, room_type_id) VALUES (999, 999, 999, 1, 999)");

        $this->expectException(ApiException::class);
        $this->service->deleteRoom(999, self::HOTEL_ID, 1);
    }

    public function testRoomTypeFromAnotherHotelCannotBeEditedOrDeleted(): void
    {
        $this->db->exec("INSERT INTO hotels (id, name) VALUES (999, 'Other Hotel')");
        $this->db->exec("INSERT INTO settings (hotel_id) VALUES (999)");
        $this->db->exec("INSERT INTO room_types (id, hotel_id, code, name, rate, max_persons) VALUES (999, 999, 'STD', 'Standard', 1000, 2)");

        $this->expectException(ApiException::class);
        $this->service->updateRoomType(999, 'Hacked', 1, 1, 1, self::HOTEL_ID);
    }

    private function fetchRoomByNo(int $roomNo): array
    {
        $stmt = $this->db->prepare('SELECT * FROM rooms WHERE hotel_id = :h AND room_no = :n');
        $stmt->execute(['h' => self::HOTEL_ID, 'n' => $roomNo]);
        $row = $stmt->fetch();
        $this->assertIsArray($row, "seed room {$roomNo} must exist for this test");
        return $row;
    }
}
