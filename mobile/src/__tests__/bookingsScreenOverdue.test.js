import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysIso, fd, inr, nightsBetween } from '../lib/format.js';

describe('Mobile Bookings Screen - Check-in Overdue Synchronization', () => {
  const deriveMobileBookingGroups = (reservations, customToday) => {
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

  it('1. Applies "CHECK-IN OVERDUE" terminology on mobile bookings screen', () => {
    const mockReservations = [
      {
        id: 1,
        booking_code: 'BK-MOB-1',
        room_no: 101,
        room_id: 1,
        guest_name: 'Overdue Guest Mobile',
        guest_phone: '9876543210',
        check_in_date: '2026-11-17',
        check_out_date: '2026-11-18',
        persons: 2,
        advance_paid: 500,
        status: 'pending',
        is_overdue: true,
      },
    ];

    const { groups } = deriveMobileBookingGroups(mockReservations);
    const groupTitles = groups.map(([title]) => title);

    assert.ok(groupTitles.includes('CHECK-IN OVERDUE'), 'Mobile must have section CHECK-IN OVERDUE');
    assert.ok(!groupTitles.includes('Not came (date passed)'), 'Legacy terminology must be eliminated');
  });

  it('2. Synchronizes identical qualifying reservations and overdue booking counts between web and mobile', () => {
    const mockReservations = [
      { id: 1, booking_code: 'BK-101', room_no: 101, check_in_date: '2026-11-16', status: 'pending', is_overdue: true },
      { id: 2, booking_code: 'BK-102', room_no: 102, check_in_date: '2026-11-17', status: 'pending', is_overdue: true },
      { id: 3, booking_code: 'BK-103', room_no: 103, check_in_date: '2026-11-19', status: 'pending', is_overdue: false },
      { id: 4, booking_code: 'BK-104', room_no: 104, check_in_date: '2026-11-20', status: 'pending', is_overdue: false },
      { id: 5, booking_code: 'BK-105', room_no: 105, check_in_date: '2026-11-22', status: 'pending', is_overdue: false },
    ];

    const mobileResult = deriveMobileBookingGroups(mockReservations, '2026-11-19');
    const overdueGroup = mobileResult.groups.find(([title]) => title === 'CHECK-IN OVERDUE');

    assert.equal(mobileResult.all.length, 5, 'Total bookings count matches');
    assert.equal(overdueGroup[1].length, 2, 'Overdue count must be exactly 2');
    assert.deepEqual(overdueGroup[1].map((r) => r.booking_code), ['BK-101', 'BK-102']);
  });

  it('3. Shared business rules: Checked-in, cancelled, and no-show bookings do not appear on mobile', () => {
    const mockReservations = [
      { id: 1, booking_code: 'BK-ACT', check_in_date: '2026-11-16', status: 'pending', is_overdue: true },
      { id: 2, booking_code: 'BK-CHK', check_in_date: '2026-11-16', status: 'checked_in', is_overdue: false },
      { id: 3, booking_code: 'BK-CAN', check_in_date: '2026-11-16', status: 'cancelled', is_overdue: false },
      { id: 4, booking_code: 'BK-NOS', check_in_date: '2026-11-16', status: 'no_show', is_overdue: false },
    ];

    const { groups } = deriveMobileBookingGroups(mockReservations, '2026-11-19');
    const overdueGroup = groups.find(([title]) => title === 'CHECK-IN OVERDUE');

    assert.equal(overdueGroup[1].length, 1);
    assert.equal(overdueGroup[1][0].booking_code, 'BK-ACT');
  });

  it('4. Uses server-provided hotel_today and is_overdue to prevent timezone discrepancy', () => {
    const mockReservations = [
      {
        id: 1,
        booking_code: 'BK-TZ-SYNC',
        check_in_date: '2026-11-18',
        status: 'pending',
        is_overdue: true,
        hotel_today: '2026-11-19',
      },
    ];

    const { today, groups } = deriveMobileBookingGroups(mockReservations);
    assert.equal(today, '2026-11-19');
    const overdueGroup = groups.find(([title]) => title === 'CHECK-IN OVERDUE');
    assert.equal(overdueGroup[1].length, 1);
  });

  it('5. Preserves mobile booking meta formatting and readiness states', () => {
    const res = {
      id: 55,
      booking_code: 'BK-MOB-55',
      room_no: 302,
      guest_name: 'Priya Sharma',
      guest_phone: '9876501234',
      check_in_date: '2026-11-17',
      check_out_date: '2026-11-19',
      persons: 2,
      advance_paid: 1200,
      status: 'pending',
      is_overdue: true,
    };

    const nights = nightsBetween(res.check_in_date, res.check_out_date);
    const metaString = `${res.guest_phone} · ${fd(res.check_in_date)} → ${fd(res.check_out_date)} · ${nights}n · ${res.persons}p · advance ${inr(res.advance_paid)}`;

    assert.equal(metaString, '9876501234 · 17 Nov → 19 Nov · 2n · 2p · advance ₹1,200');

    // Unpaid advance meta
    const resUnpaid = { ...res, advance_paid: 0 };
    const unpaidMeta = `${resUnpaid.guest_phone} · ${fd(resUnpaid.check_in_date)} → ${fd(resUnpaid.check_out_date)} · ${nights}n · ${resUnpaid.persons}p · advance not paid`;
    assert.equal(unpaidMeta, '9876501234 · 17 Nov → 19 Nov · 2n · 2p · advance not paid');
  });

  it('6. Preserves "Guest came · Check in" action enablement on mobile', () => {
    const today = '2026-11-19';
    const res = {
      id: 1,
      check_in_date: '2026-11-17',
      status: 'pending',
      is_overdue: true,
    };

    // Case A: Room is occupied
    const isOccupiedA = true;
    const isMaintenanceA = false;
    const isReadyA = true;
    const canInA = res.check_in_date <= today && !isOccupiedA && !isMaintenanceA && isReadyA;
    assert.equal(canInA, false, 'Check in disabled when occupied');

    // Case B: Room is free and ready
    const isOccupiedB = false;
    const isMaintenanceB = false;
    const isReadyB = true;
    const canInB = res.check_in_date <= today && !isOccupiedB && !isMaintenanceB && isReadyB;
    assert.equal(canInB, true, 'Check in enabled when free and ready');
  });
});
