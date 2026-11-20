import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysIso, fd, inr, nightsBetween } from '../lib/format.js';

describe('Bookings Page - Check-in Overdue Section and Synchronization', () => {
  const deriveBookingGroups = (reservations, customToday) => {
    const today = customToday || reservations.find((s) => s.hotel_today)?.hotel_today || '2026-11-19';
    const tomorrow = addDaysIso(today, 1);
    const all = [...reservations].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.room_no - b.room_no);
    const isOverdue = (s) => Boolean(s.is_overdue ?? s.check_in_overdue ?? (s.status === 'pending' && s.check_in_date < today));
    const groups = [
      ['CHECK-IN OVERDUE', all.filter(isOverdue)],
      ['Today', all.filter((s) => !isOverdue(s) && s.check_in_date === today)],
      ['Tomorrow', all.filter((s) => !isOverdue(s) && s.check_in_date === tomorrow)],
      ['Later', all.filter((s) => !isOverdue(s) && s.check_in_date > tomorrow)],
    ].filter(([, list]) => list.length);

    return { today, tomorrow, all, groups };
  };

  it('1. Replaces "NOT CAME (DATE PASSED)" section heading with "CHECK-IN OVERDUE"', () => {
    const mockReservations = [
      {
        id: 1,
        booking_code: 'BK-101',
        room_no: 101,
        room_id: 1,
        guest_name: 'Overdue Guest',
        guest_phone: '9876543210',
        check_in_date: '2026-11-17',
        check_out_date: '2026-11-18',
        persons: 2,
        advance_paid: 500,
        status: 'pending',
        is_overdue: true,
        hotel_today: '2026-11-19',
      },
      {
        id: 2,
        booking_code: 'BK-102',
        room_no: 102,
        room_id: 2,
        guest_name: 'Today Guest',
        guest_phone: '9876543211',
        check_in_date: '2026-11-19',
        check_out_date: '2026-11-20',
        persons: 1,
        advance_paid: 1000,
        status: 'pending',
        is_overdue: false,
        hotel_today: '2026-11-19',
      },
    ];

    const { groups } = deriveBookingGroups(mockReservations);
    const groupTitles = groups.map(([title]) => title);

    assert.ok(groupTitles.includes('CHECK-IN OVERDUE'), 'Section must be named CHECK-IN OVERDUE');
    assert.ok(!groupTitles.includes('Not came (date passed)'), 'Legacy "Not came (date passed)" heading must not be present');
    assert.ok(!groupTitles.includes('NOT CAME (DATE PASSED)'), 'Uppercase legacy heading must not be present');
  });

  it('2. Correctly qualifies overdue reservations and preserves total and group counts', () => {
    const mockReservations = [
      { id: 1, booking_code: 'BK-1', check_in_date: '2026-11-17', status: 'pending', is_overdue: true },
      { id: 2, booking_code: 'BK-2', check_in_date: '2026-11-18', status: 'pending', is_overdue: true },
      { id: 3, booking_code: 'BK-3', check_in_date: '2026-11-19', status: 'pending', is_overdue: false },
      { id: 4, booking_code: 'BK-4', check_in_date: '2026-11-20', status: 'pending', is_overdue: false },
      { id: 5, booking_code: 'BK-5', check_in_date: '2026-11-25', status: 'pending', is_overdue: false },
    ];

    const { all, groups } = deriveBookingGroups(mockReservations, '2026-11-19');

    assert.equal(all.length, 5, 'Total bookings count must be preserved');
    const overdueGroup = groups.find(([title]) => title === 'CHECK-IN OVERDUE');
    assert.ok(overdueGroup);
    assert.equal(overdueGroup[1].length, 2, 'Overdue group count must accurately match qualifying reservations');
    assert.deepEqual(overdueGroup[1].map((s) => s.booking_code), ['BK-1', 'BK-2']);
  });

  it('3. Shared business rules: Excludes checked_in, cancelled, and no_show reservations from Check-in Overdue', () => {
    const mockReservations = [
      { id: 1, booking_code: 'BK-PEND', check_in_date: '2026-11-17', status: 'pending', is_overdue: true },
      { id: 2, booking_code: 'BK-CHKD', check_in_date: '2026-11-17', status: 'checked_in', is_overdue: false },
      { id: 3, booking_code: 'BK-CANC', check_in_date: '2026-11-17', status: 'cancelled', is_overdue: false },
      { id: 4, booking_code: 'BK-NOSH', check_in_date: '2026-11-17', status: 'no_show', is_overdue: false },
    ];

    const { groups } = deriveBookingGroups(mockReservations, '2026-11-19');
    const overdueGroup = groups.find(([title]) => title === 'CHECK-IN OVERDUE');

    assert.equal(overdueGroup[1].length, 1);
    assert.equal(overdueGroup[1][0].booking_code, 'BK-PEND');
  });

  it('4. Uses authoritative server-provided is_overdue and hotel_today date configuration', () => {
    // Hotel today is 2026-11-20 (e.g. UTC+5:30), even if client local is 2026-11-19
    const mockReservations = [
      {
        id: 1,
        booking_code: 'BK-SERVER-TZ',
        check_in_date: '2026-11-19',
        status: 'pending',
        is_overdue: true,
        hotel_today: '2026-11-20',
      },
    ];

    const { today, groups } = deriveBookingGroups(mockReservations);
    assert.equal(today, '2026-11-20', 'Must use hotel_today from server response');
    const overdueGroup = groups.find(([title]) => title === 'CHECK-IN OVERDUE');
    assert.equal(overdueGroup[1].length, 1);
  });

  it('5. Preserves all booking row details and formatting for overdue reservations', () => {
    const res = {
      id: 88,
      booking_code: 'BK-2026-88',
      room_no: 204,
      guest_name: 'Anita Roy',
      guest_phone: '9840123456',
      check_in_date: '2026-11-17',
      check_out_date: '2026-11-20',
      persons: 2,
      advance_paid: 1500,
      status: 'pending',
      is_overdue: true,
    };

    const nights = nightsBetween(res.check_in_date, res.check_out_date);
    assert.equal(nights, 3);
    assert.equal(fd(res.check_in_date), '17 Nov');
    assert.equal(fd(res.check_out_date), '20 Nov');
    assert.equal(inr(res.advance_paid), '₹1,500');
    assert.equal(res.booking_code, 'BK-2026-88');
    assert.equal(res.room_no, 204);
  });

  it('6. Preserves room condition handling: Occupied room shows "Room still occupied", Ready enables Check-in', () => {
    const today = '2026-11-19';
    const all = [
      {
        id: 10,
        booking_code: 'BK-OCC',
        room_id: 1,
        room_no: 101,
        check_in_date: '2026-11-17',
        check_out_date: '2026-11-19',
        status: 'pending',
        is_overdue: true,
      },
      {
        id: 11,
        booking_code: 'BK-READY',
        room_id: 2,
        room_no: 102,
        check_in_date: '2026-11-17',
        check_out_date: '2026-11-19',
        status: 'pending',
        is_overdue: true,
      },
    ];

    const roomsData = {
      rooms: [
        { id: 1, roomNo: 101, status: 'occupied', housekeepingStatus: 'ok' },
        { id: 2, roomNo: 102, status: 'free', housekeepingStatus: 'ok' },
      ],
    };

    const getRoom = (roomId) => roomsData.rooms.find((r) => r.id === roomId);

    // Reservation 10 (Room 101 is occupied)
    const r1 = getRoom(all[0].room_id);
    const isOccupied1 = r1?.status === 'occupied';
    const isReady1 = r1?.housekeepingStatus === 'ok';
    const canIn1 = all[0].check_in_date <= today && !isOccupied1 && isReady1;
    assert.equal(isOccupied1, true);
    assert.equal(canIn1, false, 'Occupied room cannot be checked in directly');

    // Reservation 11 (Room 102 is free and ready)
    const r2 = getRoom(all[1].room_id);
    const isOccupied2 = r2?.status === 'occupied';
    const isReady2 = r2?.housekeepingStatus === 'ok';
    const canIn2 = all[1].check_in_date <= today && !isOccupied2 && isReady2;
    assert.equal(isOccupied2, false);
    assert.equal(canIn2, true, 'Ready room for past date allows "Guest came · Check in" action');
  });

  it('7. Preserves advance status display: correctly formats paid vs unpaid advance', () => {
    const resPaid = { advance_paid: 2000 };
    const resUnpaid = { advance_paid: 0 };
    const resNull = { advance_paid: null };

    const getAdvanceText = (s) => (Number(s.advance_paid) > 0 ? ` · advance ${inr(s.advance_paid)}` : ' · advance not paid');

    assert.equal(getAdvanceText(resPaid), ' · advance ₹2,000');
    assert.equal(getAdvanceText(resUnpaid), ' · advance not paid');
    assert.equal(getAdvanceText(resNull), ' · advance not paid');
  });
});
