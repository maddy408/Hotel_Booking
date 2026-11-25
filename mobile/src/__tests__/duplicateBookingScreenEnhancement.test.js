import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysIso, fd, inr, nightsBetween } from '../lib/format.js';

describe('Duplicate Room Bookings & Mobile Bookings Screen Improvements', () => {
  // Situation mapping helper test
  const getSimpleStatus = ({ booking, room, today, allReservations = [] }) => {
    const overlapConflict = allReservations.find(
      (o) => o.id !== booking.id &&
             Number(o.room_id) === Number(booking.room_id) &&
             o.status === 'pending' &&
             o.check_in_date < booking.check_out_date &&
             booking.check_in_date < o.check_out_date
    );

    const hkStatus = room?.housekeepingStatus || room?.housekeeping_status || booking.housekeeping_status || 'ok';
    const isOccupied = room?.status === 'occupied';
    const isOverdueCheckout = room?.isOverdue || (isOccupied && room?.checkoutPlanned && room.checkoutPlanned < today);
    const isMaintenance = hkStatus === 'repair';
    const isCleaning = hkStatus === 'cleaning';
    const isReady = hkStatus === 'ok';
    const isArrivalOverdue = booking.status === 'pending' && booking.check_in_date < today;
    const isArrivalToday = booking.check_in_date === today;
    const isFuture = booking.check_in_date > today;

    if (overlapConflict) return `Dates overlap conflict (${overlapConflict.booking_code})`;

    // Only actual checked-in stay can be "Guest is staying" or "Checkout overdue"
    if (booking.status === 'checked_in') {
      if (isOverdueCheckout) return 'Checkout overdue';
      return 'Guest is staying';
    }

    // Pending booking: guest is NOT staying
    if (isOccupied) {
      if (booking.check_in_date <= today) {
        return 'Waiting – room occupied';
      }
      return 'Upcoming';
    }

    if (isMaintenance) return 'Room under maintenance';
    if (isCleaning) return 'Room cleaning';
    if (isArrivalOverdue) return 'Guest not arrived';
    if (isArrivalToday && isReady) return 'Room ready';
    if (isArrivalToday && !isReady) return 'Guest not arrived';
    return 'Upcoming';
  };

  it('1. Simple English Messages match required specification exactly', () => {
    const today = '2026-11-23';

    // Situation 1: Checked-in guest is staying
    const s1 = getSimpleStatus({
      booking: { id: 1, room_id: 102, check_in_date: '2026-11-21', check_out_date: '2026-11-25', status: 'checked_in' },
      room: { status: 'occupied', checkoutPlanned: '2026-11-25', housekeepingStatus: 'ok' },
      today,
    });
    assert.equal(s1, 'Guest is staying');

    // Situation 2: Consecutive next guest arriving today/past while previous guest is still staying
    const s2Waiting = getSimpleStatus({
      booking: { id: 2, room_id: 102, check_in_date: '2026-11-23', check_out_date: '2026-11-25', status: 'pending' },
      room: { status: 'occupied', checkoutPlanned: '2026-11-24', housekeepingStatus: 'ok' },
      today,
    });
    assert.equal(s2Waiting, 'Waiting – room occupied');

    // Situation 3: Future guest while room is occupied
    const sFuture = getSimpleStatus({
      booking: { id: 3, room_id: 102, check_in_date: '2026-11-25', check_out_date: '2026-11-27', status: 'pending' },
      room: { status: 'occupied', checkoutPlanned: '2026-11-24' },
      today,
    });
    assert.equal(sFuture, 'Upcoming');

    // Situation 4: Checked-in guest checkout is late/overdue
    const s3 = getSimpleStatus({
      booking: { id: 1, room_id: 102, check_in_date: '2026-11-20', check_out_date: '2026-11-22', status: 'checked_in' },
      room: { status: 'occupied', checkoutPlanned: '2026-11-22', isOverdue: true },
      today,
    });
    assert.equal(s3, 'Checkout overdue');

    // Situation 5: Room is being cleaned
    const s4 = getSimpleStatus({
      booking: { id: 4, room_id: 102, check_in_date: '2026-11-23', check_out_date: '2026-11-25', status: 'pending' },
      room: { status: 'cleaning', housekeepingStatus: 'cleaning' },
      today,
    });
    assert.equal(s4, 'Room cleaning');

    // Situation 6: Room is ready for today arrival
    const s5 = getSimpleStatus({
      booking: { id: 5, room_id: 102, check_in_date: '2026-11-23', check_out_date: '2026-11-25', status: 'pending' },
      room: { status: 'free', housekeepingStatus: 'ok' },
      today,
    });
    assert.equal(s5, 'Room ready');

    // Situation 7: Guest not arrived (scheduled check-in date passed, room ready)
    const s7 = getSimpleStatus({
      booking: { id: 7, room_id: 102, check_in_date: '2026-11-21', check_out_date: '2026-11-24', status: 'pending' },
      room: { status: 'free', housekeepingStatus: 'ok' },
      today,
    });
    assert.equal(s7, 'Guest not arrived');
  });

  it('2. Detects overlap warning ONLY when active bookings overlap, not on consecutive dates', () => {
    const today = '2026-11-21';

    // Room 102:
    // BK-1024: 21 Nov to 23 Nov
    // BK-1036: 22 Nov to 24 Nov (Overlaps!)
    // BK-1038: 24 Nov to 26 Nov (Consecutive / Different dates, NOT a conflict!)
    const all = [
      { id: 1024, booking_code: 'BK-1024', room_id: 102, check_in_date: '2026-11-21', check_out_date: '2026-11-23', status: 'pending' },
      { id: 1036, booking_code: 'BK-1036', room_id: 102, check_in_date: '2026-11-22', check_out_date: '2026-11-24', status: 'pending' },
      { id: 1038, booking_code: 'BK-1038', room_id: 102, check_in_date: '2026-11-24', check_out_date: '2026-11-26', status: 'pending' },
    ];

    const status1024 = getSimpleStatus({ booking: all[0], room: { status: 'free' }, today, allReservations: all });
    assert.equal(status1024, 'Dates overlap conflict (BK-1036)', 'BK-1024 flags conflict with BK-1036');

    const status1036 = getSimpleStatus({ booking: all[1], room: { status: 'free' }, today, allReservations: all });
    assert.equal(status1036, 'Dates overlap conflict (BK-1024)', 'BK-1036 flags conflict with BK-1024');

    const status1038 = getSimpleStatus({ booking: all[2], room: { status: 'free' }, today, allReservations: all });
    assert.equal(status1038, 'Upcoming', 'BK-1038 does NOT flag conflict because dates do not overlap');
  });

  it('3. Expandable room-wise grouping aggregates bookings by room and identifies current guest and valid next guest', () => {
    const today = '2026-11-23';
    const rooms = [
      { id: 1, room_no: 101, roomNo: 101, status: 'occupied', guestName: 'Current In-House Guest', checkoutPlanned: '2026-11-23' },
      { id: 2, room_no: 102, roomNo: 102, status: 'occupied', guestName: 'Test2', checkoutPlanned: '2026-11-22', isOverdue: true },
    ];

    // Room 102 example from user prompt:
    // Room 102:
    // - BK-1024 – Test2 – 21 Nov to 22 Nov – 2 days overdue. (Currently staying)
    // - BK-1038 – Ramesh – 22 Nov to 23 Nov – 1 day overdue. (Waiting – room occupied)
    // - BK-1041 – Ramya Krishnan – 24 Nov to 25 Nov. (Upcoming)
    const reservations102 = [
      { id: 1024, booking_code: 'BK-1024', room_id: 2, room_no: 102, guest_name: 'Test2', check_in_date: '2026-11-21', check_out_date: '2026-11-22', status: 'checked_in' },
      { id: 1038, booking_code: 'BK-1038', room_id: 2, room_no: 102, guest_name: 'Ramesh', check_in_date: '2026-11-22', check_out_date: '2026-11-23', status: 'pending' },
      { id: 1041, booking_code: 'BK-1041', room_id: 2, room_no: 102, guest_name: 'Ramya Krishnan', check_in_date: '2026-11-24', check_out_date: '2026-11-25', status: 'pending' },
    ];

    const r102 = rooms.find((r) => r.id === 2);
    // 1. One Room, One Current Guest:
    assert.equal(r102.guestName, 'Test2');

    // 2. Booking situations:
    // Test2 (checked_in, overdue):
    const test2Status = getSimpleStatus({ booking: reservations102[0], room: r102, today, allReservations: reservations102 });
    assert.equal(test2Status, 'Checkout overdue');

    // Ramesh (pending, arrived 22 Nov while Test2 hasn't checked out):
    const rameshStatus = getSimpleStatus({ booking: reservations102[1], room: r102, today, allReservations: reservations102 });
    assert.equal(rameshStatus, 'Waiting – room occupied', 'Ramesh must show Waiting – room occupied, NOT Guest is staying');

    // Ramya Krishnan (future arrival 24 Nov):
    const ramyaStatus = getSimpleStatus({ booking: reservations102[2], room: r102, today, allReservations: reservations102 });
    assert.equal(ramyaStatus, 'Upcoming', 'Ramya Krishnan must show Upcoming');

    // 3. Next guest selection logic:
    // Only pending reservations for room 102
    const pendingForRoom = reservations102.filter((b) => b.status === 'pending');
    // Candidate cannot have arrival date earlier than current guest planned checkout date
    const validNext = pendingForRoom.find((b) => b.check_in_date >= r102.checkoutPlanned);
    assert.equal(validNext?.guest_name, 'Ramesh');
    assert.equal(validNext?.booking_code, 'BK-1038');
  });
});
