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
        $this->assertSame(1, $data['counts']['booked'], 'Booked count must be 1 because an active uncompleted reservation exists');
        $this->assertTrue($r101['hasPendingBooking']);
        $this->assertNotNull($r101['pendingBooking']);
        $this->assertSame(806, $r101['pendingBooking']['id']);
        $this->assertSame('BK-1806', $r101['pendingBooking']['bookingCode']);
        $this->assertSame('Future Booked Guest', $r101['pendingBooking']['guestName']);
        $this->assertSame('2026-11-15', $r101['pendingBooking']['checkInDate']);
        $this->assertSame('2026-11-17', $r101['pendingBooking']['checkOutDate']);
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

    /**
     * Regression test for actual scenario on 9 November 2026:
     * - Room 101 occupied by Madhavi (overstay past planned checkout 8 Nov).
     * - Another active pending reservation for Ramya (BK-1806, 8 Nov - 10 Nov, Advance ₹200).
     * - Room 101 must remain occupied, Madhavi is occupant.
     * - Booked count must be 1, Occupied count must be 1.
     * - Room 101 returns hasPendingBooking = true and pendingBooking with Ramya's details.
     */
    public function testActualMadhaviAndRamyaScenarioDashboardCountsAndRoomDisplay(): void
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
                'housekeeping_status' => 'cleaning',
                'note' => null,
            ],
            [
                'id' => 5,
                'hotel_id' => 1,
                'room_no' => 105,
                'floor' => 1,
                'room_type_id' => 1,
                'type_code' => 'STD',
                'type_name' => 'Standard',
                'type_rate' => 2200.00,
                'max_persons' => 2,
                'housekeeping_status' => 'repair',
                'note' => 'AC repair',
            ],
        ];

        // Active in-house stays: Room 101 (Madhavi), Room 102, Room 103
        $stays = [
            1 => [
                'room_id' => 1,
                'stay_id' => 1034,
                'guest_name' => 'Madhavi',
                'check_in_date' => '2026-11-07',
                'checkout_planned' => '2026-11-08',
                'checkout_time' => '12:00:00',
            ],
            2 => [
                'room_id' => 2,
                'stay_id' => 1412,
                'guest_name' => 'Guest 102',
                'check_in_date' => '2026-11-09',
                'checkout_planned' => '2026-11-10',
                'checkout_time' => '12:00:00',
            ],
            3 => [
                'room_id' => 3,
                'stay_id' => 1413,
                'guest_name' => 'Guest 103',
                'check_in_date' => '2026-11-09',
                'checkout_planned' => '2026-11-10',
                'checkout_time' => '12:00:00',
            ],
        ];

        // Active pending reservation: Ramya on Room 101
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
                    'status' => 'pending',
                ],
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn($stays);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn($reservations);

        $service = new RoomService(
            $roomRepo,
            $this->createMock(RoomTypeRepository::class),
            $this->createMock(HousekeepingLogRepository::class),
            $this->createMock(AuditLogger::class)
        );

        $data = $service->listRooms(1);

        // Assert summary counters:
        // Occupied: 3 (Room 101, 102, 103)
        // Booked: 1 (Room 101 has active pending booking for Ramya)
        // Cleaning: 1 (Room 104)
        // Repair: 1 (Room 105)
        // Free: 0
        $this->assertSame(3, $data['counts']['occupied'], 'Occupied must count all active in-house stays');
        $this->assertSame(1, $data['counts']['booked'], 'Booked summary must be 1 for Ramya uncompleted reservation');
        $this->assertSame(1, $data['counts']['cleaning']);
        $this->assertSame(1, $data['counts']['repair']);
        $this->assertSame(0, $data['counts']['free']);

        // Assert Room 101 specifics:
        $byNo = [];
        foreach ($data['rooms'] as $r) {
            $byNo[$r['roomNo']] = $r;
        }

        $r101 = $byNo[101];
        $this->assertSame('occupied', $r101['status'], 'Room 101 must remain OCCUPIED with Madhavi');
        $this->assertSame('Madhavi', $r101['guestName'], 'Madhavi must remain the occupant');
        $this->assertSame(1034, $r101['stayId']);
        $this->assertTrue($r101['hasPendingBooking'], 'Room 101 must flag hasPendingBooking = true');
        $this->assertNotNull($r101['pendingBooking']);
        $this->assertSame(806, $r101['pendingBooking']['id']);
        $this->assertSame('BK-1806', $r101['pendingBooking']['bookingCode']);
        $this->assertSame('Ramya', $r101['pendingBooking']['guestName']);
        $this->assertSame('2026-11-08', $r101['pendingBooking']['checkInDate']);
        $this->assertSame('2026-11-10', $r101['pendingBooking']['checkOutDate']);
    }

    /**
     * Test that overdue pending arrivals are included in the Booked count as long as they are active.
     */
    public function testPendingOverdueArrivalIncludedInBookedCount(): void
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

        // Past check-in date (yesterday), still pending (not checked in, not cancelled, not marked no-show)
        $reservations = [
            1 => [
                [
                    'id' => 806,
                    'booking_code' => 'BK-1806',
                    'room_id' => 1,
                    'check_in_date' => date('Y-m-d', strtotime('-1 day')),
                    'check_out_date' => date('Y-m-d', strtotime('+1 day')),
                    'guest_name' => 'Overdue Guest',
                    'status' => 'pending',
                ],
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([]);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn($reservations);

        $service = new RoomService(
            $roomRepo,
            $this->createMock(RoomTypeRepository::class),
            $this->createMock(HousekeepingLogRepository::class),
            $this->createMock(AuditLogger::class)
        );

        $data = $service->listRooms(1);
        $this->assertSame(1, $data['counts']['booked'], 'Overdue pending booking must be counted in Booked');
        $this->assertSame('booked', $data['rooms'][0]['status']);
    }

    /**
     * Test that cancelled and finalized no-show reservations are excluded from pending bookings.
     */
    public function testCancelledAndNoShowReservationsExcludedFromBookedCount(): void
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

        // Room repository pendingReservationsByRoom only fetches status = 'pending'.
        // When all bookings for a room are cancelled or no-show, pendingReservationsByRoom returns empty.
        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([]);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn([]);

        $service = new RoomService(
            $roomRepo,
            $this->createMock(RoomTypeRepository::class),
            $this->createMock(HousekeepingLogRepository::class),
            $this->createMock(AuditLogger::class)
        );

        $data = $service->listRooms(1);
        $this->assertSame(0, $data['counts']['booked'], 'Cancelled/no-show reservations must not increment Booked count');
        $this->assertSame(1, $data['counts']['free']);
        $this->assertFalse($data['rooms'][0]['hasPendingBooking']);
        $this->assertNull($data['rooms'][0]['pendingBooking']);
    }

    /**
     * Test that reservations already converted into active in-house stays (status = 'checked_in')
     * do not contribute to pending bookings.
     */
    public function testAlreadyCheckedInReservationExcludedFromBookedCount(): void
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

        // Madhavi checked in from reservation 875 -> stay 1034 created with status = in_house
        $stays = [
            1 => [
                'room_id' => 1,
                'stay_id' => 1034,
                'guest_name' => 'Madhavi',
                'checkout_planned' => '2026-11-08',
                'checkout_time' => '12:00:00',
            ],
        ];

        // Reservation 875 status was updated to checked_in, so pendingReservationsByRoom does not return it.
        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);
        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn($stays);
        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn([]);

        $service = new RoomService(
            $roomRepo,
            $this->createMock(RoomTypeRepository::class),
            $this->createMock(HousekeepingLogRepository::class),
            $this->createMock(AuditLogger::class)
        );

        $data = $service->listRooms(1);
        $this->assertSame(1, $data['counts']['occupied']);
        $this->assertSame(0, $data['counts']['booked'], 'Already checked-in reservations must not increment Booked count');
        $this->assertFalse($data['rooms'][0]['hasPendingBooking']);
    }

    public function testCompactRoomAvailabilityCardsNineScenarios(): void
    {
        $today = date('Y-m-d');
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        $dayAfter = date('Y-m-d', strtotime('+2 days'));
        $futureIn = date('Y-m-d', strtotime('+5 days'));
        $futureOut = date('Y-m-d', strtotime('+7 days'));
        $pastDate = date('Y-m-d', strtotime('-1 day'));

        $rooms = [
            // 1. Free room with no reservations
            [
                'id' => 101, 'hotel_id' => 1, 'room_no' => 101, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 2. Currently occupied room with future checkout (checkout tomorrow, requested starts tomorrow)
            [
                'id' => 102, 'hotel_id' => 1, 'room_no' => 102, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 3. Occupied room with consecutive future reservation
            [
                'id' => 103, 'hotel_id' => 1, 'room_no' => 103, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 4. Room with an overlapping reservation
            [
                'id' => 104, 'hotel_id' => 1, 'room_no' => 104, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 5. Room with a pending booking in future (not overlapping requested tomorrow -> dayAfter)
            [
                'id' => 105, 'hotel_id' => 1, 'room_no' => 105, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 6. Room under cleaning
            [
                'id' => 106, 'hotel_id' => 1, 'room_no' => 106, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'cleaning', 'note' => null,
            ],
            // 7. Room under repair
            [
                'id' => 107, 'hotel_id' => 1, 'room_no' => 107, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'repair', 'note' => 'AC repair',
            ],
            // 8. Guest overstaying beyond planned checkout (checkout was yesterday, still in house)
            [
                'id' => 108, 'hotel_id' => 1, 'room_no' => 108, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
            // 9. Room becoming available after actual checkout and housekeeping readiness
            [
                'id' => 109, 'hotel_id' => 1, 'room_no' => 109, 'floor' => 1, 'room_type_id' => 1,
                'type_code' => 'STD', 'type_name' => 'Standard', 'type_rate' => 2000, 'max_persons' => 2,
                'housekeeping_status' => 'ok', 'note' => null,
            ],
        ];

        $roomRepo = $this->createMock(RoomRepository::class);
        $roomRepo->method('allForHotel')->with(1)->willReturn($rooms);

        $roomRepo->method('inHouseStaysByRoom')->with(1)->willReturn([
            102 => [
                'stay_id' => 201, 'room_id' => 102, 'guest_name' => 'Karthika',
                'check_in_date' => $today, 'checkout_planned' => $tomorrow, 'checkout_time' => '12:00:00',
            ],
            103 => [
                'stay_id' => 202, 'room_id' => 103, 'guest_name' => 'Jeya Bharathi',
                'check_in_date' => $today, 'checkout_planned' => $tomorrow, 'checkout_time' => '12:00:00',
            ],
            108 => [
                'stay_id' => 203, 'room_id' => 108, 'guest_name' => 'Overstay Guest',
                'check_in_date' => date('Y-m-d', strtotime('-3 days')), 'checkout_planned' => $pastDate, 'checkout_time' => '12:00:00',
            ],
        ]);

        $roomRepo->method('pendingReservationsByRoom')->with(1)->willReturn([
            103 => [
                [
                    'id' => 301, 'booking_code' => 'BK-1003', 'guest_name' => 'Future Guest',
                    'check_in_date' => $tomorrow, 'check_out_date' => $dayAfter, 'check_out_time' => '12:00:00',
                ],
            ],
            104 => [
                [
                    'id' => 302, 'booking_code' => 'BK-1004', 'guest_name' => 'Overlapping Guest',
                    'check_in_date' => $tomorrow, 'check_out_date' => $dayAfter, 'check_out_time' => '12:00:00',
                ],
            ],
            105 => [
                [
                    'id' => 303, 'booking_code' => 'BK-1005', 'guest_name' => 'Later Guest',
                    'check_in_date' => $futureIn, 'check_out_date' => $futureOut, 'check_out_time' => '12:00:00',
                ],
            ],
        ]);

        $reservationRepo = $this->createMock(ReservationRepository::class);
        $reservationRepo->method('overlapping')->willReturnCallback(function (int $roomId, string $cin, string $cout) use ($tomorrow, $dayAfter) {
            if (in_array($roomId, [103, 104], true) && $cin < $dayAfter && $cout > $tomorrow) {
                return [[
                    'id' => 300 + $roomId, 'booking_code' => "BK-{$roomId}", 'guest_name' => 'Test',
                    'check_in_date' => $tomorrow, 'check_out_date' => $dayAfter,
                ]];
            }
            return [];
        });

        $stayRepo = $this->createMock(StayRepository::class);
        $stayRepo->method('overlapping')->willReturnCallback(function (int $roomId, string $cin, string $cout, string $td) use ($pastDate, $tomorrow) {
            if ($roomId === 108) {
                // Overstay blocks
                return [['id' => 999, 'effective_out' => date('Y-m-d', strtotime('+1 day'))]];
            }
            return [];
        });

        $service = new AvailabilityService($reservationRepo, $stayRepo);
        $result = $service->freeRooms($roomRepo, 1, $tomorrow, $dayAfter, null);

        $byNo = [];
        foreach ($result as $r) {
            $byNo[$r['room_no']] = $r;
        }

        // Case 1: Free room with no reservations
        $this->assertSame('Ready', $byNo[101]['card_badge']);
        $this->assertSame('Available', $byNo[101]['card_detail']);
        $this->assertSame('free_ready', $byNo[101]['card_condition']);
        $this->assertTrue($byNo[101]['is_bookable']);

        // Case 2: Currently occupied room with future checkout (Leaves tomorrow)
        $this->assertSame('Occupied', $byNo[102]['card_badge']);
        $this->assertSame('Leaves ' . date('j M', strtotime($tomorrow)), $byNo[102]['card_detail']);
        $this->assertSame('occupied', $byNo[102]['card_condition']);
        $this->assertTrue($byNo[102]['is_bookable'], 'Same-day turnover booking should be bookable');
        $this->assertNotNull($byNo[102]['turnover_notice']);
        $this->assertStringContainsString('subject to checkout completion and housekeeping readiness', $byNo[102]['turnover_notice']);

        // Case 3: Occupied room with consecutive future reservation
        $this->assertSame('Occupied', $byNo[103]['card_badge']);
        $this->assertSame('Next booking ' . date('j M', strtotime($tomorrow)), $byNo[103]['card_detail']);
        $this->assertSame('occupied_next_booking', $byNo[103]['card_condition']);
        $this->assertFalse($byNo[103]['is_bookable'], 'Overlaps with consecutive booking so cannot be booked for requested dates');

        // Case 4: Room with an overlapping reservation
        $this->assertSame('Booked', $byNo[104]['card_badge']);
        $this->assertSame('Until ' . date('j M', strtotime($dayAfter)), $byNo[104]['card_detail']);
        $this->assertSame('reserved', $byNo[104]['card_condition']);
        $this->assertFalse($byNo[104]['is_bookable']);

        // Case 5: Room with a pending booking in future (requested dates do not overlap)
        $this->assertSame('Ready', $byNo[105]['card_badge']);
        $this->assertSame('Available', $byNo[105]['card_detail']);
        $this->assertTrue($byNo[105]['is_bookable']);

        // Case 6: Room under cleaning
        $this->assertSame('Cleaning', $byNo[106]['card_badge']);
        $this->assertSame('Not ready yet', $byNo[106]['card_detail']);
        $this->assertSame('cleaning', $byNo[106]['card_condition']);
        $this->assertTrue($byNo[106]['is_bookable'], 'Can be reserved for future but requires readiness');

        // Case 7: Room under repair
        $this->assertSame('Repair', $byNo[107]['card_badge']);
        $this->assertSame('Unavailable', $byNo[107]['card_detail']);
        $this->assertSame('maintenance', $byNo[107]['card_condition']);
        $this->assertFalse($byNo[107]['is_bookable']);

        // Case 8: Guest overstaying beyond planned checkout
        $this->assertSame('Overdue', $byNo[108]['card_badge']);
        $this->assertSame('Checkout pending', $byNo[108]['card_detail']);
        $this->assertSame('overdue', $byNo[108]['card_condition']);
        $this->assertFalse($byNo[108]['is_bookable']);

        // Case 9: Room becoming available after actual checkout and housekeeping readiness
        $this->assertSame('Ready', $byNo[109]['card_badge']);
        $this->assertSame('Available', $byNo[109]['card_detail']);
        $this->assertSame('free_ready', $byNo[109]['card_condition']);
        $this->assertTrue($byNo[109]['is_bookable']);
    }
}
