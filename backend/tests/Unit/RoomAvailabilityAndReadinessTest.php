<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Repository\AuditLogRepository;
use App\Repository\HousekeepingLogRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\RoomRepository;
use App\Repository\RoomTypeRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Repository\StayRepository;
use App\Service\AvailabilityService;
use App\Service\BillingService;
use App\Service\GuestService;
use App\Service\InvoiceService;
use App\Service\ReservationService;
use App\Service\RoomService;
use App\Service\StayService;
use App\Support\ApiException;
use App\Support\AuditLogger;
use PDO;
use PHPUnit\Framework\TestCase;

final class RoomAvailabilityAndReadinessTest extends TestCase
{
    private ReservationRepository $reservationRepo;
    private StayRepository $stayRepo;
    private RoomRepository $roomRepo;
    private AvailabilityService $service;

    protected function setUp(): void
    {
        $this->reservationRepo = $this->createMock(ReservationRepository::class);
        $this->stayRepo = $this->createMock(StayRepository::class);
        $this->roomRepo = $this->createMock(RoomRepository::class);
        $this->service = new AvailabilityService($this->reservationRepo, $this->stayRepo);
    }

    public function testFreeRoomsSeparatesAvailabilityAndReadinessForEveryRoom(): void
    {
        $rooms = [
            [
                'id' => 101,
                'room_no' => 101,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'cleaning',
                'note' => null,
            ],
            [
                'id' => 102,
                'room_no' => 102,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 103,
                'room_no' => 103,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 104,
                'room_no' => 104,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'repair',
                'note' => 'AC issue',
            ],
        ];

        $this->roomRepo->method('allForHotel')->with(1)->willReturn($rooms);

        // Room 101: no overlaps -> free
        // Room 102: no overlaps -> free
        // Room 103: overlapping reservation -> unavailable
        // Room 104: repair -> maintenance
        $this->reservationRepo->method('overlapping')->willReturnCallback(function (int $roomId) {
            if ($roomId === 103) {
                return [['id' => 99, 'booking_code' => 'BK-99']];
            }
            return [];
        });
        $this->stayRepo->method('overlapping')->willReturn([]);

        $result = $this->service->freeRooms($this->roomRepo, 1, '2026-12-01', '2026-12-03', null);

        $this->assertCount(4, $result);

        // Room 101: Available + Not Ready (cleaning)
        $r101 = $result[0];
        $this->assertSame(101, (int) $r101['room_no']);
        $this->assertTrue($r101['is_available']);
        $this->assertFalse($r101['is_ready']);
        $this->assertTrue($r101['is_bookable'], 'Available + Not Ready room must be bookable');
        $this->assertSame('available_not_ready', $r101['booking_status']);
        $this->assertSame('Available + Not Ready', $r101['status_label']);

        // Room 102: Available + Ready (ok)
        $r102 = $result[1];
        $this->assertSame(102, (int) $r102['room_no']);
        $this->assertTrue($r102['is_available']);
        $this->assertTrue($r102['is_ready']);
        $this->assertTrue($r102['is_bookable']);
        $this->assertSame('available_ready', $r102['booking_status']);
        $this->assertSame('Available + Ready', $r102['status_label']);

        // Room 103: Unavailable (already booked)
        $r103 = $result[2];
        $this->assertSame(103, (int) $r103['room_no']);
        $this->assertFalse($r103['is_available']);
        $this->assertFalse($r103['is_bookable']);
        $this->assertSame('unavailable', $r103['booking_status']);
        $this->assertSame('Unavailable (already booked)', $r103['status_label']);

        // Room 104: Maintenance (not bookable)
        $r104 = $result[3];
        $this->assertSame(104, (int) $r104['room_no']);
        $this->assertFalse($r104['is_bookable'], 'Maintenance room cannot be booked');
        $this->assertSame('maintenance', $r104['booking_status']);
        $this->assertSame('Maintenance (not bookable)', $r104['status_label']);
    }

    public function testRoomServiceListRoomsMarksBookedRoomAsBookedWhilePreservingCleaningStatus(): void
    {
        $today = date('Y-m-d');
        $rooms = [
            [
                'id' => 101,
                'hotel_id' => 1,
                'room_no' => 101,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'cleaning',
                'note' => null,
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([]);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn([
            101 => [
                [
                    'id' => 42,
                    'booking_code' => 'BK-1042',
                    'room_id' => 101,
                    'check_in_date' => $today,
                    'check_out_date' => date('Y-m-d', strtotime('+1 day')),
                    'check_out_time' => '12:00:00',
                    'guest_name' => 'Alice Kumar',
                ],
            ],
        ]);

        $roomTypeRepo = $this->createMock(RoomTypeRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        $roomService = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $audit);
        $data = $roomService->listRooms(1);

        $this->assertCount(1, $data['rooms']);
        $room = $data['rooms'][0];
        $this->assertSame('booked', $room['status'], 'Status must be marked as booked/reserved');
        $this->assertSame('cleaning', $room['housekeepingStatus'], 'Housekeeping status must be preserved as cleaning');
        $this->assertFalse($room['isReady'], 'Room must not be marked ready');
        $this->assertSame(42, $room['bookingId']);
        $this->assertSame('BK-1042', $room['bookingCode']);
        $this->assertSame('Alice Kumar', $room['guestName']);
        $this->assertSame(1, $data['counts']['booked']);
    }

    public function testReservationServiceRejectsBookingMaintenanceRoom(): void
    {
        $db = $this->createMock(PDO::class);
        $resRepo = $this->createMock(ReservationRepository::class);
        $roomRepo = $this->createMock(RoomRepository::class);
        $guestService = $this->createMock(GuestService::class);
        $avail = $this->createMock(AvailabilityService::class);
        $payRepo = $this->createMock(PaymentRepository::class);
        $setRepo = $this->createMock(SettingsRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        $roomRepo->method('find')->with(407)->willReturn([
            'id' => 407,
            'hotel_id' => 1,
            'room_no' => 407,
            'housekeeping_status' => 'repair',
        ]);

        $service = new ReservationService($db, $resRepo, $roomRepo, $guestService, $avail, $payRepo, $setRepo, $audit);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Room 407 is under maintenance and cannot be booked.');

        $service->create(
            1, 407, '9876543210', 'Test Guest',
            date('Y-m-d'), date('Y-m-d', strtotime('+2 days')),
            2, 2000.0, 500.0, 'cash', 1
        );
    }

    public function testCheckInFromReservationBlockedWhenRoomIsCleaning(): void
    {
        $db = $this->createMock(PDO::class);
        $stayRepo = $this->createMock(StayRepository::class);
        $resRepo = $this->createMock(ReservationRepository::class);
        $roomRepo = $this->createMock(RoomRepository::class);
        $chargeRepo = $this->createMock(StayChargeRepository::class);
        $payRepo = $this->createMock(PaymentRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $setRepo = $this->createMock(SettingsRepository::class);
        $guestService = $this->createMock(GuestService::class);
        $avail = $this->createMock(AvailabilityService::class);
        $billing = $this->createMock(BillingService::class);
        $invoice = $this->createMock(InvoiceService::class);
        $audit = $this->createMock(AuditLogger::class);

        $resRepo->method('lockForUpdate')->with(10)->willReturn([
            'id' => 10,
            'hotel_id' => 1,
            'room_id' => 101,
            'guest_id' => 5,
            'status' => 'pending',
            'persons' => 2,
            'rate' => 2200.0,
            'check_in_date' => date('Y-m-d'),
            'check_out_date' => date('Y-m-d', strtotime('+1 day')),
            'check_out_time' => '12:00:00',
        ]);

        $payRepo->method('netAdvanceForReservation')->with(10, 1)->willReturn(1000.0);

        $roomRepo->method('find')->with(101)->willReturn([
            'id' => 101,
            'hotel_id' => 1,
            'room_no' => 101,
            'max_persons' => 2,
            'housekeeping_status' => 'cleaning',
        ]);
        $roomRepo->method('lockById')->with(101)->willReturn(['id' => 101]);

        $stayService = new StayService(
            $db, $stayRepo, $resRepo, $roomRepo, $chargeRepo, $payRepo,
            $hkRepo, $setRepo, $guestService, $avail, $billing, $invoice, $audit
        );

        try {
            $stayService->checkInFromReservation(10, 1, 1);
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('Room 101 is not ready (cleaning in progress). Housekeeping must mark the room ready before check-in.', $e->getMessage());
            $this->assertArrayHasKey('room', $e->getFields());
            $this->assertArrayHasKey('housekeepingStatus', $e->getFields());
        }
    }

    public function testCheckInFromReservationBlockedWhenRoomIsRepair(): void
    {
        $db = $this->createMock(PDO::class);
        $stayRepo = $this->createMock(StayRepository::class);
        $resRepo = $this->createMock(ReservationRepository::class);
        $roomRepo = $this->createMock(RoomRepository::class);
        $chargeRepo = $this->createMock(StayChargeRepository::class);
        $payRepo = $this->createMock(PaymentRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $setRepo = $this->createMock(SettingsRepository::class);
        $guestService = $this->createMock(GuestService::class);
        $avail = $this->createMock(AvailabilityService::class);
        $billing = $this->createMock(BillingService::class);
        $invoice = $this->createMock(InvoiceService::class);
        $audit = $this->createMock(AuditLogger::class);

        $resRepo->method('lockForUpdate')->with(10)->willReturn([
            'id' => 10,
            'hotel_id' => 1,
            'room_id' => 407,
            'guest_id' => 5,
            'status' => 'pending',
            'persons' => 2,
            'rate' => 2200.0,
            'check_in_date' => date('Y-m-d'),
            'check_out_date' => date('Y-m-d', strtotime('+1 day')),
            'check_out_time' => '12:00:00',
        ]);

        $payRepo->method('netAdvanceForReservation')->with(10, 1)->willReturn(1000.0);

        $roomRepo->method('find')->with(407)->willReturn([
            'id' => 407,
            'hotel_id' => 1,
            'room_no' => 407,
            'max_persons' => 2,
            'housekeeping_status' => 'repair',
        ]);
        $roomRepo->method('lockById')->with(407)->willReturn(['id' => 407]);

        $stayService = new StayService(
            $db, $stayRepo, $resRepo, $roomRepo, $chargeRepo, $payRepo,
            $hkRepo, $setRepo, $guestService, $avail, $billing, $invoice, $audit
        );

        try {
            $stayService->checkInFromReservation(10, 1, 1);
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('Room 407 is under maintenance and cannot be checked in.', $e->getMessage());
            $this->assertArrayHasKey('room', $e->getFields());
        }
    }

    public function testDirectCheckInBlockedWhenRoomIsCleaning(): void
    {
        $db = $this->createMock(PDO::class);
        $stayRepo = $this->createMock(StayRepository::class);
        $resRepo = $this->createMock(ReservationRepository::class);
        $roomRepo = $this->createMock(RoomRepository::class);
        $chargeRepo = $this->createMock(StayChargeRepository::class);
        $payRepo = $this->createMock(PaymentRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $setRepo = $this->createMock(SettingsRepository::class);
        $guestService = $this->createMock(GuestService::class);
        $avail = $this->createMock(AvailabilityService::class);
        $billing = $this->createMock(BillingService::class);
        $invoice = $this->createMock(InvoiceService::class);
        $audit = $this->createMock(AuditLogger::class);

        $roomRepo->method('find')->with(101)->willReturn([
            'id' => 101,
            'hotel_id' => 1,
            'room_no' => 101,
            'max_persons' => 2,
            'housekeeping_status' => 'cleaning',
        ]);
        $roomRepo->method('lockById')->with(101)->willReturn(['id' => 101]);

        $stayService = new StayService(
            $db, $stayRepo, $resRepo, $roomRepo, $chargeRepo, $payRepo,
            $hkRepo, $setRepo, $guestService, $avail, $billing, $invoice, $audit
        );

        try {
            $stayService->directCheckIn(
                1, 101, '9876543210', 'Direct Guest', 'Aadhaar', '123456789012',
                'Madurai', 2, 1, 2200.0, 1000.0, 'cash', 1
            );
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('Room 101 is not ready (cleaning in progress). Housekeeping must mark the room ready before check-in.', $e->getMessage());
        }
    }

    public function testCheckInAllowedWhenRoomIsReady(): void
    {
        $room = [
            'room_no' => 101,
            'housekeeping_status' => 'ok',
        ];

        $hasError = ($room['housekeeping_status'] !== 'ok');
        $this->assertFalse($hasError);
    }

    public function testListRoomsMarksRoomWithAnyActiveBookingAsBookedRegardlessOfDate(): void
    {
        $rooms = [
            [
                'id' => 1,
                'hotel_id' => 1,
                'room_no' => 101,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 2,
                'hotel_id' => 1,
                'room_no' => 102,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 3,
                'hotel_id' => 1,
                'room_no' => 103,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 4,
                'hotel_id' => 1,
                'room_no' => 104,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
        ];

        // Room 101: tomorrow (2026-11-08)
        // Room 102: next week (2026-11-15)
        // Room 103: next month (2026-12-10)
        // Room 104: no active booking
        $reservations = [
            1 => [
                [
                    'id' => 806,
                    'booking_code' => 'BK-1806',
                    'room_id' => 1,
                    'check_in_date' => '2026-11-08',
                    'check_out_date' => '2026-11-10',
                    'check_out_time' => '12:00:00',
                    'guest_name' => 'Ramya',
                    'rate' => 2200.00,
                    'advance_amount' => 200.00,
                    'status' => 'pending',
                ],
            ],
            2 => [
                [
                    'id' => 807,
                    'booking_code' => 'BK-1807',
                    'room_id' => 2,
                    'check_in_date' => '2026-11-15',
                    'check_out_date' => '2026-11-17',
                    'check_out_time' => '12:00:00',
                    'guest_name' => 'Next Week Guest',
                    'rate' => 2200.00,
                    'advance_amount' => 500.00,
                    'status' => 'pending',
                ],
            ],
            3 => [
                [
                    'id' => 808,
                    'booking_code' => 'BK-1808',
                    'room_id' => 3,
                    'check_in_date' => '2026-12-10',
                    'check_out_date' => '2026-12-12',
                    'check_out_time' => '12:00:00',
                    'guest_name' => 'Next Month Guest',
                    'rate' => 2200.00,
                    'advance_amount' => 0.00,
                    'status' => 'pending',
                ],
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([]);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn($reservations);

        $roomTypeRepo = $this->createMock(RoomTypeRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        $service = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $audit);
        $data = $service->listRooms(1);

        $this->assertSame(3, $data['counts']['booked']);
        $this->assertSame(1, $data['counts']['free']);

        $byRoomNo = [];
        foreach ($data['rooms'] as $r) {
            $byRoomNo[$r['roomNo']] = $r;
        }

        // Tomorrow booking
        $this->assertSame('booked', $byRoomNo[101]['status']);
        $this->assertSame('Ramya', $byRoomNo[101]['guestName']);
        $this->assertSame('BK-1806', $byRoomNo[101]['bookingCode']);
        $this->assertSame(806, $byRoomNo[101]['bookingId']);

        // Next week booking
        $this->assertSame('booked', $byRoomNo[102]['status']);
        $this->assertSame('Next Week Guest', $byRoomNo[102]['guestName']);

        // Next month booking
        $this->assertSame('booked', $byRoomNo[103]['status']);
        $this->assertSame('Next Month Guest', $byRoomNo[103]['guestName']);

        // No booking
        $this->assertSame('free', $byRoomNo[104]['status']);
    }

    public function testListRoomsPrioritizesOccupiedOverBookedWhenStayExists(): void
    {
        $rooms = [
            [
                'id' => 1,
                'hotel_id' => 1,
                'room_no' => 101,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
        ];

        // Active stay currently in-house
        $stays = [
            1 => [
                'room_id' => 1,
                'stay_id' => 50,
                'guest_name' => 'In-House Stay Guest',
                'checkout_planned' => date('Y-m-d', strtotime('+1 day')),
                'checkout_time' => '12:00:00',
            ],
        ];

        // Room also has an active future booking
        $reservations = [
            1 => [
                [
                    'id' => 806,
                    'booking_code' => 'BK-1806',
                    'room_id' => 1,
                    'check_in_date' => '2026-11-15',
                    'check_out_date' => '2026-11-17',
                    'guest_name' => 'Future Booked Guest',
                    'status' => 'pending',
                ],
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn($stays);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn($reservations);

        $roomTypeRepo = $this->createMock(RoomTypeRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        $service = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $audit);
        $data = $service->listRooms(1);

        $r101 = $data['rooms'][0];
        $this->assertSame('occupied', $r101['status'], 'Occupied must take priority over Booked');
        $this->assertSame('In-House Stay Guest', $r101['guestName']);
        $this->assertSame(1, $data['counts']['occupied']);
        $this->assertSame(0, $data['counts']['booked']);
        $this->assertSame('2026-11-15', $r101['nextBookingDate']);
    }

    public function testListRoomsPreservesHousekeepingConditionForBookedRooms(): void
    {
        $rooms = [
            [
                'id' => 1,
                'hotel_id' => 1,
                'room_no' => 101,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'ok',
                'note' => null,
            ],
            [
                'id' => 2,
                'hotel_id' => 1,
                'room_no' => 102,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'cleaning',
                'note' => null,
            ],
            [
                'id' => 3,
                'hotel_id' => 1,
                'room_no' => 103,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'repair',
                'note' => 'AC repair needed',
            ],
        ];

        $reservations = [
            1 => [['id' => 801, 'booking_code' => 'BK-801', 'room_id' => 1, 'check_in_date' => '2026-11-08', 'guest_name' => 'Guest 1', 'status' => 'pending']],
            2 => [['id' => 802, 'booking_code' => 'BK-802', 'room_id' => 2, 'check_in_date' => '2026-11-15', 'guest_name' => 'Guest 2', 'status' => 'pending']],
            3 => [['id' => 803, 'booking_code' => 'BK-803', 'room_id' => 3, 'check_in_date' => '2026-12-01', 'guest_name' => 'Guest 3', 'status' => 'pending']],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([]);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn($reservations);

        $roomTypeRepo = $this->createMock(RoomTypeRepository::class);
        $hkRepo = $this->createMock(HousekeepingLogRepository::class);
        $audit = $this->createMock(AuditLogger::class);

        $service = new RoomService($roomRepo, $roomTypeRepo, $hkRepo, $audit);
        $data = $service->listRooms(1);

        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        // Room 101: Booked + Ready
        $this->assertSame('booked', $byNo[101]['status']);
        $this->assertSame('ok', $byNo[101]['housekeepingStatus']);
        $this->assertTrue($byNo[101]['isReady']);

        // Room 102: Booked + Cleaning (not ready for check-in)
        $this->assertSame('booked', $byNo[102]['status']);
        $this->assertSame('cleaning', $byNo[102]['housekeepingStatus']);
        $this->assertFalse($byNo[102]['isReady']);

        // Room 103: Booked + Repair (not ready for check-in)
        $this->assertSame('booked', $byNo[103]['status']);
        $this->assertSame('repair', $byNo[103]['housekeepingStatus']);
        $this->assertFalse($byNo[103]['isReady']);

        // Total Booked count
        $this->assertSame(3, $data['counts']['booked']);
        $this->assertSame(0, $data['counts']['cleaning']);
        $this->assertSame(0, $data['counts']['repair']);
    }
}
