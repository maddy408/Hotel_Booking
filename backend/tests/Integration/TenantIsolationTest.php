<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Database\Connection;
use App\Repository\AuditLogRepository;
use App\Repository\GuestRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\InvoiceRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GstService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

/**
 * A JWT for hotel A must never be able to read or mutate hotel B's reservations/stays —
 * broken access control (OWASP #1) across the multi-tenant schema. Every method here
 * targets hotel 1 (seeded) while acting as hotel 999 (created here), and expects a 404.
 *
 * No outer transaction here (unlike the other Integration tests): the services under
 * test open and manage their own transactions, which PDO cannot nest. Each blocked call
 * throws before anything is written (the service's own catch block rolls itself back),
 * so this stays side-effect-free against the seed data without an outer wrapper.
 */
final class TenantIsolationTest extends TestCase
{
    private PDO $db;
    private StayService $stayService;
    private ReservationService $reservationService;
    private const OWN_HOTEL_ID = 1;
    private const OTHER_HOTEL_ID = 999;

    protected function setUp(): void
    {
        $this->db = Connection::get();
        $this->db->exec("INSERT INTO hotels (id, name) VALUES (999, 'Other Hotel')");
        $this->db->exec("INSERT INTO settings (hotel_id) VALUES (999)");

        $guestRepo = new GuestRepository($this->db);
        $guestService = new GuestService($guestRepo);
        $roomRepo = new RoomRepository($this->db);
        $reservationRepo = new ReservationRepository($this->db);
        $stayRepo = new StayRepository($this->db);
        $paymentRepo = new PaymentRepository($this->db);
        $settingsRepo = new SettingsRepository($this->db);
        $audit = new AuditLogger(new AuditLogRepository($this->db));
        $availability = new AvailabilityService($reservationRepo, $stayRepo);
        $billing = new BillingService(new GstService($settingsRepo), new StayChargeRepository($this->db), $paymentRepo);
        $invoiceService = new InvoiceService($this->db, new InvoiceRepository($this->db));

        $this->reservationService = new ReservationService($this->db, $reservationRepo, $roomRepo, $guestService, $availability, $paymentRepo, $settingsRepo, $audit);
        $this->stayService = new StayService(
            $this->db, $stayRepo, $reservationRepo, $roomRepo, new StayChargeRepository($this->db), $paymentRepo,
            new HousekeepingLogRepository($this->db), $settingsRepo, $guestService, $availability, $billing, $invoiceService, $audit,
        );
    }

    protected function tearDown(): void
    {
        $this->db->exec('DELETE FROM settings WHERE hotel_id = 999');
        $this->db->exec('DELETE FROM hotels WHERE id = 999');
    }

    private function ownStayId(int $roomNo): int
    {
        $stmt = $this->db->prepare(
            "SELECT s.id FROM stays s JOIN rooms r ON r.id = s.room_id
             WHERE r.hotel_id = :h AND r.room_no = :n AND s.status = 'in_house'"
        );
        $stmt->execute(['h' => self::OWN_HOTEL_ID, 'n' => $roomNo]);
        return (int) $stmt->fetchColumn();
    }

    private function ownReservationId(): int
    {
        $stmt = $this->db->prepare("SELECT id FROM reservations WHERE hotel_id = :h AND status = 'pending' LIMIT 1");
        $stmt->execute(['h' => self::OWN_HOTEL_ID]);
        return (int) $stmt->fetchColumn();
    }

    public function testStayFromAnotherHotelCannotBeViewed(): void
    {
        $this->expectException(ApiException::class);
        $this->stayService->find($this->ownStayId(102), self::OTHER_HOTEL_ID);
    }

    public function testStayFromAnotherHotelCannotBeCheckedOut(): void
    {
        $this->expectException(ApiException::class);
        $this->stayService->checkout($this->ownStayId(104), self::OTHER_HOTEL_ID, 'cash', null, 1);
    }

    public function testStayFromAnotherHotelCannotReceiveExtras(): void
    {
        $this->expectException(ApiException::class);
        $this->stayService->addExtra($this->ownStayId(106), self::OTHER_HOTEL_ID, 'Food', 100.0, false, 1);
    }

    public function testReservationFromAnotherHotelCannotBeCancelled(): void
    {
        $this->expectException(ApiException::class);
        $this->reservationService->cancel($this->ownReservationId(), self::OTHER_HOTEL_ID, 'hack', 0, 'cash', 1);
    }

    public function testReservationFromAnotherHotelCannotBeCheckedIn(): void
    {
        $this->expectException(ApiException::class);
        $this->stayService->checkInFromReservation($this->ownReservationId(), self::OTHER_HOTEL_ID, 1);
    }
}
