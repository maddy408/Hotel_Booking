<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Controller\ReservationController;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\SettingsRepository;
use App\Router\Request;
use App\Service\AvailabilityService;
use App\Service\GuestService;
use App\Service\ReservationService;
use App\Service\StayService;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class CheckInOverdueTest extends TestCase
{
    private const HOTEL_ID = 1;

    private function createService(
        ?SettingsRepository $settingsRepo = null,
        ?ReservationRepository $resRepo = null
    ): ReservationService {
        $db = $this->createMock(PDO::class);
        $resRepo = $resRepo ?? $this->createMock(ReservationRepository::class);
        $roomRepo = $this->createMock(RoomRepository::class);
        $guestService = $this->createMock(GuestService::class);
        $avail = $this->createMock(AvailabilityService::class);
        $payRepo = $this->createMock(PaymentRepository::class);
        $settingsRepo = $settingsRepo ?? $this->createMock(SettingsRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        return new ReservationService($db, $resRepo, $roomRepo, $guestService, $avail, $payRepo, $settingsRepo, $audit);
    }

    public function testScenario1PastCheckInDateAndPendingStatusIsOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));

        $res = [
            'id' => 101,
            'status' => 'pending',
            'check_in_date' => $pastDate,
            'advance_paid' => 500.0,
        ];

        $this->assertTrue($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario2TodayCheckInDateIsNotOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);

        $res = [
            'id' => 102,
            'status' => 'pending',
            'check_in_date' => $today,
            'advance_paid' => 500.0,
        ];

        $this->assertFalse($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario3FutureCheckInDateIsNotOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $futureDate = date('Y-m-d', strtotime($today . ' +3 days'));

        $res = [
            'id' => 103,
            'status' => 'pending',
            'check_in_date' => $futureDate,
            'advance_paid' => 500.0,
        ];

        $this->assertFalse($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario4AlreadyCheckedInReservationIsNotOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));

        $res = [
            'id' => 104,
            'status' => 'checked_in',
            'check_in_date' => $pastDate,
            'advance_paid' => 500.0,
        ];

        $this->assertFalse($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario5CancelledReservationIsNotOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));

        $res = [
            'id' => 105,
            'status' => 'cancelled',
            'check_in_date' => $pastDate,
            'advance_paid' => 0.0,
        ];

        $this->assertFalse($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario6ConfirmedNoShowReservationIsNotOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));

        $res = [
            'id' => 106,
            'status' => 'no_show',
            'check_in_date' => $pastDate,
            'advance_paid' => 500.0,
        ];

        $this->assertFalse($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario7PastDateWithOccupiedRoomIsOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -1 day'));

        // Room is currently occupied, but the reservation itself is still pending and overdue
        $res = [
            'id' => 107,
            'status' => 'pending',
            'check_in_date' => $pastDate,
            'room_status' => 'occupied',
            'advance_paid' => 1000.0,
        ];

        $this->assertTrue($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testScenario8PastDateWithUnpaidAdvanceIsOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);
        $service = $this->createService($settingsRepo);

        $today = $service->hotelToday(self::HOTEL_ID);
        $pastDate = date('Y-m-d', strtotime($today . ' -3 days'));

        $res = [
            'id' => 108,
            'status' => 'pending',
            'check_in_date' => $pastDate,
            'advance_paid' => 0.0,
            'advance_amount' => 0.0,
        ];

        $this->assertTrue($service->isReservationOverdue($res, self::HOTEL_ID));
    }

    public function testHotelTimezoneConfigurationDeterminesTodayAndOverdue(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        // Using Pacific/Honolulu (UTC-10) vs Asia/Kolkata (UTC+5:30)
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Pacific/Honolulu']);
        $service = $this->createService($settingsRepo);

        $honoluluToday = (new \DateTimeImmutable('now', new \DateTimeZone('Pacific/Honolulu')))->format('Y-m-d');
        $this->assertSame($honoluluToday, $service->hotelToday(self::HOTEL_ID));
    }

    public function testListEnrichesReservationsWithOverdueFlagsAndHotelToday(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);

        $today = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
        $pastDate = date('Y-m-d', strtotime($today . ' -1 day'));
        $futureDate = date('Y-m-d', strtotime($today . ' +2 days'));

        $resRepo = $this->createMock(ReservationRepository::class);
        $resRepo->method('listPending')->with(self::HOTEL_ID)->willReturn([
            [
                'id' => 1,
                'status' => 'pending',
                'check_in_date' => $pastDate,
                'booking_code' => 'BK-PAST',
            ],
            [
                'id' => 2,
                'status' => 'pending',
                'check_in_date' => $today,
                'booking_code' => 'BK-TODAY',
            ],
            [
                'id' => 3,
                'status' => 'pending',
                'check_in_date' => $futureDate,
                'booking_code' => 'BK-FUTURE',
            ],
        ]);

        $service = $this->createService($settingsRepo, $resRepo);
        $result = $service->list(self::HOTEL_ID);

        $this->assertCount(3, $result);

        // Past booking
        $this->assertTrue($result[0]['is_overdue']);
        $this->assertTrue($result[0]['check_in_overdue']);
        $this->assertSame($today, $result[0]['hotel_today']);

        // Today booking
        $this->assertFalse($result[1]['is_overdue']);
        $this->assertFalse($result[1]['check_in_overdue']);
        $this->assertSame($today, $result[1]['hotel_today']);

        // Future booking
        $this->assertFalse($result[2]['is_overdue']);
        $this->assertFalse($result[2]['check_in_overdue']);
        $this->assertSame($today, $result[2]['hotel_today']);
    }

    public function testListOverdueFiltersOnlyOverdueReservations(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);

        $today = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
        $pastDate = date('Y-m-d', strtotime($today . ' -2 days'));
        $futureDate = date('Y-m-d', strtotime($today . ' +1 day'));

        $resRepo = $this->createMock(ReservationRepository::class);
        $resRepo->method('listPending')->with(self::HOTEL_ID)->willReturn([
            [
                'id' => 1,
                'status' => 'pending',
                'check_in_date' => $pastDate,
                'booking_code' => 'BK-OVERDUE-1',
            ],
            [
                'id' => 2,
                'status' => 'pending',
                'check_in_date' => $today,
                'booking_code' => 'BK-TODAY',
            ],
            [
                'id' => 3,
                'status' => 'pending',
                'check_in_date' => $futureDate,
                'booking_code' => 'BK-FUTURE',
            ],
        ]);

        $service = $this->createService($settingsRepo, $resRepo);
        $overdueList = $service->listOverdue(self::HOTEL_ID);

        $this->assertCount(1, $overdueList);
        $this->assertSame('BK-OVERDUE-1', $overdueList[0]['booking_code']);
        $this->assertTrue($overdueList[0]['is_overdue']);
    }

    public function testReservationControllerIndexSupportsStatusOverdueFilter(): void
    {
        $settingsRepo = $this->createMock(SettingsRepository::class);
        $settingsRepo->method('find')->with(self::HOTEL_ID)->willReturn(['timezone' => 'Asia/Kolkata']);

        $today = (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Kolkata')))->format('Y-m-d');
        $pastDate = date('Y-m-d', strtotime($today . ' -1 day'));
        $futureDate = date('Y-m-d', strtotime($today . ' +1 day'));

        $resRepo = $this->createMock(ReservationRepository::class);
        $resRepo->method('listPending')->with(self::HOTEL_ID)->willReturn([
            ['id' => 1, 'status' => 'pending', 'check_in_date' => $pastDate, 'booking_code' => 'BK-OD'],
            ['id' => 2, 'status' => 'pending', 'check_in_date' => $futureDate, 'booking_code' => 'BK-FUT'],
        ]);

        $service = $this->createService($settingsRepo, $resRepo);
        $stayService = new StayService(
            $this->createMock(PDO::class),
            $this->createMock(\App\Repository\StayRepository::class),
            $this->createMock(ReservationRepository::class),
            $this->createMock(RoomRepository::class),
            $this->createMock(\App\Repository\StayChargeRepository::class),
            $this->createMock(PaymentRepository::class),
            $this->createMock(\App\Repository\HousekeepingLogRepository::class),
            $this->createMock(SettingsRepository::class),
            $this->createMock(GuestService::class),
            $this->createMock(AvailabilityService::class),
            $this->createMock(\App\Service\BillingService::class),
            $this->createMock(\App\Service\InvoiceService::class),
            $this->createMock(AuditLogger::class)
        );
        $controller = new ReservationController($service, $stayService);

        // 1. Without query params -> returns all 2
        $reqAll = new Request('GET', '/reservations', [], [], [], '127.0.0.1');
        $reqAll->setAttribute('hotelId', self::HOTEL_ID);
        $all = $controller->index($reqAll);
        $this->assertCount(2, $all);

        // 2. With status=overdue -> returns only 1
        $reqOverdue = new Request('GET', '/reservations', ['status' => 'overdue'], [], [], '127.0.0.1');
        $reqOverdue->setAttribute('hotelId', self::HOTEL_ID);
        $filtered = $controller->index($reqOverdue);
        $this->assertCount(1, $filtered);
        $this->assertSame('BK-OD', $filtered[0]['booking_code']);
    }
}
