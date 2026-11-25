import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getSimpleBookingSituation } from '../lib/bookingSituation.js';

describe('Mobile Room-wise View & Single Room Occupancy Business Rules (8 Core + Edge Scenarios)', () => {
  const today = '2026-11-24';

  // Helper simulating the Room-wise aggregation logic used in BookingsScreen.jsx
  const aggregateRoom = ({ room, bookings, todayIso }) => {
    const sorted = [...bookings].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
    const pendingForRoom = sorted.filter((b) => b.status === 'pending');

    let validNext = null;
    if (room?.status === 'occupied' && room?.checkoutPlanned) {
      // Rule: Do not show a next guest whose arrival date is earlier than current guest checkout date
      validNext = pendingForRoom.find((b) => b.check_in_date >= room.checkoutPlanned) || null;
    } else {
      validNext = pendingForRoom.find((b) => b.check_in_date >= todayIso) || pendingForRoom[0] || null;
    }

    const isActuallyStaying = room?.status === 'occupied' && Boolean(room?.guestName);

    return {
      roomNo: room.room_no || room.roomNo,
      currentGuest: isActuallyStaying ? {
        name: room.guestName,
        checkout: room.checkoutPlanned,
        isOverdue: room.isOverdue || (room.checkoutPlanned && room.checkoutPlanned < todayIso),
      } : null,
      nextGuest: validNext ? {
        name: validNext.guest_name,
        checkIn: validNext.check_in_date,
        bookingCode: validNext.booking_code,
      } : null,
      totalBookingsCount: bookings.length,
    };
  };

  it('Case 1: Two guests with consecutive booking dates do not flag an overlap conflict', () => {
    // Guest A: 21 Nov to 22 Nov
    // Guest B: 22 Nov to 23 Nov
    const bookings = [
      { id: 101, booking_code: 'BK-101', room_id: 102, check_in_date: '2026-11-21', check_out_date: '2026-11-22', status: 'pending' },
      { id: 102, booking_code: 'BK-102', room_id: 102, check_in_date: '2026-11-22', check_out_date: '2026-11-23', status: 'pending' },
    ];

    const sitA = getSimpleBookingSituation(bookings[0], { status: 'free', housekeepingStatus: 'ok' }, today, bookings);
    const sitB = getSimpleBookingSituation(bookings[1], { status: 'free', housekeepingStatus: 'ok' }, today, bookings);

    assert.equal(sitA.isConflict, undefined);
    assert.equal(sitB.isConflict, undefined);
  });

  it('Case 2: Previous guest checks in and is staying', () => {
    const bookingA = { id: 101, booking_code: 'BK-101', room_id: 102, guest_name: 'Guest A', check_in_date: '2026-11-23', check_out_date: '2026-11-24', status: 'checked_in' };
    const room = { status: 'occupied', guestName: 'Guest A', bookingId: 101, checkoutPlanned: '2026-11-24', housekeepingStatus: 'ok' };

    const sitA = getSimpleBookingSituation(bookingA, room, today, [bookingA]);
    assert.equal(sitA.text, 'Guest is staying');
  });

  it('Case 3: Previous guest does not check out (overdue stay)', () => {
    const bookingA = { id: 101, booking_code: 'BK-101', room_id: 102, guest_name: 'Guest A', check_in_date: '2026-11-21', check_out_date: '2026-11-22', status: 'checked_in' };
    const room = { status: 'occupied', guestName: 'Guest A', bookingId: 101, checkoutPlanned: '2026-11-22', isOverdue: true, housekeepingStatus: 'ok' };

    const sitA = getSimpleBookingSituation(bookingA, room, today, [bookingA]);
    assert.equal(sitA.text, 'Checkout overdue');
  });

  it('Case 4: Two bookings with overlapping dates flag an overlap conflict and block check-in', () => {
    const booking1 = { id: 201, booking_code: 'BK-201', room_id: 102, check_in_date: '2026-11-23', check_out_date: '2026-11-26', status: 'pending' };
    const booking2 = { id: 202, booking_code: 'BK-202', room_id: 102, check_in_date: '2026-11-24', check_out_date: '2026-11-27', status: 'pending' };

    const room = { status: 'free', housekeepingStatus: 'ok' };
    const all = [booking1, booking2];

    const sit1 = getSimpleBookingSituation(booking1, room, today, all);
    const sit2 = getSimpleBookingSituation(booking2, room, today, all);

    assert.equal(sit1.isConflict, true);
    assert.equal(sit1.conflictBookingCode, 'BK-202');
    assert.equal(sit2.isConflict, true);
    assert.equal(sit2.conflictBookingCode, 'BK-201');

    // Check-in must be blocked when overlap conflict exists
    const canIn = booking1.status === 'pending' && !sit1.isConflict;
    assert.equal(canIn, false);
  });

  it('Case 5: Historical completed bookings display Checked out and never Guest is staying', () => {
    // Current guest in Room 102 is Ram
    const room = { status: 'occupied', room_no: 102, guestName: 'Ram', checkoutPlanned: '2026-11-24', housekeepingStatus: 'ok' };

    // Test2 had booking BK-1024 from 21-22 Nov, checked out
    const bookingTest2Explicit = { id: 1024, booking_code: 'BK-1024', room_id: 102, guest_name: 'Test2', check_in_date: '2026-11-21', check_out_date: '2026-11-22', status: 'checked_out' };
    const sit1 = getSimpleBookingSituation(bookingTest2Explicit, room, today, [bookingTest2Explicit]);
    assert.equal(sit1.text, 'Checked out');

    // Historical booking with status 'checked_in' but different current occupant (Ram)
    const bookingTest2Stale = { id: 1024, booking_code: 'BK-1024', room_id: 102, guest_name: 'Test2', check_in_date: '2026-11-21', check_out_date: '2026-11-22', status: 'checked_in', stay_status: 'checked_out' };
    const sit2 = getSimpleBookingSituation(bookingTest2Stale, room, today, [bookingTest2Stale]);
    assert.equal(sit2.text, 'Checked out', 'Must display Checked out, never Guest is staying');
  });

  it('Case 6: Cancelled bookings display Cancelled and are excluded from next guest', () => {
    const bookingCancelled = { id: 301, booking_code: 'BK-CAN', room_id: 102, guest_name: 'Cancelled Guest', check_in_date: '2026-11-24', check_out_date: '2026-11-25', status: 'cancelled' };
    const sit = getSimpleBookingSituation(bookingCancelled, { status: 'free', housekeepingStatus: 'ok' }, today, [bookingCancelled]);

    assert.equal(sit.text, 'Cancelled');
    assert.equal(sit.isCancelled, true);

    const aggregated = aggregateRoom({ room: { status: 'free', housekeepingStatus: 'ok' }, bookings: [bookingCancelled], todayIso: today });
    assert.equal(aggregated.nextGuest, null, 'Cancelled bookings must never be chosen as next guest');
  });

  it('Case 7: No-show bookings display No-show and are excluded from next guest', () => {
    const bookingNoShow = { id: 302, booking_code: 'BK-NOS', room_id: 102, guest_name: 'No-show Guest', check_in_date: '2026-11-23', check_out_date: '2026-11-24', status: 'no_show' };
    const sit = getSimpleBookingSituation(bookingNoShow, { status: 'free', housekeepingStatus: 'ok' }, today, [bookingNoShow]);

    assert.equal(sit.text, 'No-show');
    assert.equal(sit.isNoShow, true);

    const aggregated = aggregateRoom({ room: { status: 'free', housekeepingStatus: 'ok' }, bookings: [bookingNoShow], todayIso: today });
    assert.equal(aggregated.nextGuest, null, 'No-show bookings must never be chosen as next guest');
  });

  it('Case 8: Room 102 Reproduction Scenario – Only Ram is staying, Test2 and Ramesh are Checked out, Ramya is Next guest', () => {
    // Room 102 is occupied by Ram, checkout today (24 Nov)
    const room102 = {
      status: 'occupied',
      room_no: 102,
      guestName: 'Ram',
      checkoutPlanned: '2026-11-24',
      housekeepingStatus: 'ok',
    };

    const bkTest2 = {
      id: 1024,
      booking_code: 'BK-1024',
      room_id: 102,
      guest_name: 'Test2',
      check_in_date: '2026-11-21',
      check_out_date: '2026-11-22',
      status: 'checked_out',
    };

    const bkRamesh = {
      id: 1038,
      booking_code: 'BK-1038',
      room_id: 102,
      guest_name: 'Ramesh',
      check_in_date: '2026-11-22',
      check_out_date: '2026-11-23',
      status: 'checked_in',
      stay_status: 'checked_out', // Historical stay completed
    };

    const bkRamya = {
      id: 1041,
      booking_code: 'BK-1041',
      room_id: 102,
      guest_name: 'Ramya Krishnan',
      check_in_date: '2026-11-24',
      check_out_date: '2026-11-25',
      status: 'pending',
    };

    const allBookings = [bkTest2, bkRamesh, bkRamya];

    // Check individual card statuses:
    const sitTest2 = getSimpleBookingSituation(bkTest2, room102, today, allBookings);
    const sitRamesh = getSimpleBookingSituation(bkRamesh, room102, today, allBookings);
    const sitRamya = getSimpleBookingSituation(bkRamya, room102, today, allBookings);

    assert.equal(sitTest2.text, 'Checked out', 'Test2 must display Checked out');
    assert.equal(sitRamesh.text, 'Checked out', 'Ramesh must display Checked out (not staying)');
    assert.equal(sitRamya.text, 'Waiting – room occupied', 'Ramya Krishnan arriving today while Ram is still staying shows Waiting – room occupied');

    // Aggregate Room Summary:
    const summary = aggregateRoom({ room: room102, bookings: allBookings, todayIso: today });

    // 1. Current guest: Only Ram
    assert.equal(summary.currentGuest?.name, 'Ram');
    assert.equal(summary.currentGuest?.checkout, '2026-11-24');

    // 2. Next guest: Ramya Krishnan
    assert.equal(summary.nextGuest?.name, 'Ramya Krishnan');
    assert.equal(summary.nextGuest?.checkIn, '2026-11-24');
    assert.equal(summary.nextGuest?.bookingCode, 'BK-1041');

    // 3. Total bookings count: 3
    assert.equal(summary.totalBookingsCount, 3);
  });
});
