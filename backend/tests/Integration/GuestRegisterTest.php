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
            $this->assertNull($eeswaran['room']); // Historical room not shown as current
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
}
