import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Rooms Filter and State Derivation Logic (All Active Bookings)', () => {
  const roomMatchesFilter = (r, f) => {
    if (f === 'all') return true;
    return r.status === f;
  };

  const deriveRoomStatus = ({ hasActiveStay, activeBooking, housekeepingStatus }) => {
    // 1. Occupied status takes priority over Booked
    if (hasActiveStay) return 'occupied';
    // 2. Active booking (pending) marks the room as booked regardless of date
    if (activeBooking && activeBooking.status === 'pending') return 'booked';
    // 3. Housekeeping conditions for unbooked & unoccupied rooms
    if (housekeepingStatus === 'repair') return 'repair';
    if (housekeepingStatus === 'cleaning') return 'cleaning';
    return 'free';
  };

  it('filters rooms correctly when Booked section is active', () => {
    const rooms = [
      { id: 1, roomNo: 101, status: 'booked', guestName: 'Ramya', bookingCode: 'BK-1806' },
      { id: 2, roomNo: 102, status: 'booked', guestName: 'Suresh', bookingCode: 'BK-1807' },
      { id: 3, roomNo: 103, status: 'free' },
      { id: 4, roomNo: 104, status: 'occupied' },
      { id: 5, roomNo: 105, status: 'cleaning' },
      { id: 6, roomNo: 407, status: 'repair' },
    ];

    const bookedRooms = rooms.filter((r) => roomMatchesFilter(r, 'booked'));
    assert.equal(bookedRooms.length, 2);
    assert.deepEqual(bookedRooms.map((r) => r.roomNo), [101, 102]);

    const allRooms = rooms.filter((r) => roomMatchesFilter(r, 'all'));
    assert.equal(allRooms.length, 6);
  });

  it('marks room as Booked regardless of whether booking is tomorrow, next week, or next month', () => {
    // Tomorrow booking
    const tomorrowBooking = { id: 801, checkIn: '2026-11-08', status: 'pending' };
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: tomorrowBooking, housekeepingStatus: 'ok' }), 'booked');

    // Next week booking
    const nextWeekBooking = { id: 802, checkIn: '2026-11-15', status: 'pending' };
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: nextWeekBooking, housekeepingStatus: 'ok' }), 'booked');

    // Next month booking
    const nextMonthBooking = { id: 803, checkIn: '2026-12-10', status: 'pending' };
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: nextMonthBooking, housekeepingStatus: 'ok' }), 'booked');
  });

  it('excludes cancelled and no_show reservations from Booked status', () => {
    // Cancelled reservation
    const cancelledBooking = { id: 804, status: 'cancelled' };
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: cancelledBooking, housekeepingStatus: 'ok' }), 'free');

    // No-show reservation
    const noShowBooking = { id: 805, status: 'no_show' };
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: noShowBooking, housekeepingStatus: 'ok' }), 'free');
  });

  it('prioritizes Occupied over Booked when active in-house stay exists', () => {
    const booking = { id: 806, checkIn: '2026-11-08', status: 'pending' };
    // Active stay present -> Occupied
    assert.equal(deriveRoomStatus({ hasActiveStay: true, activeBooking: booking, housekeepingStatus: 'ok' }), 'occupied');
  });

  it('preserves housekeeping condition independently for Booked rooms', () => {
    const booking = { id: 806, guestName: 'Ramya', status: 'pending' };

    // Booked + Ready (ok)
    const statusReady = deriveRoomStatus({ hasActiveStay: false, activeBooking: booking, housekeepingStatus: 'ok' });
    assert.equal(statusReady, 'booked');

    // Booked + Cleaning
    const statusCleaning = deriveRoomStatus({ hasActiveStay: false, activeBooking: booking, housekeepingStatus: 'cleaning' });
    assert.equal(statusCleaning, 'booked');

    // Booked + Repair
    const statusRepair = deriveRoomStatus({ hasActiveStay: false, activeBooking: booking, housekeepingStatus: 'repair' });
    assert.equal(statusRepair, 'booked');
  });

  it('identifies unbooked rooms based on housekeeping condition', () => {
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: null, housekeepingStatus: 'repair' }), 'repair');
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: null, housekeepingStatus: 'cleaning' }), 'cleaning');
    assert.equal(deriveRoomStatus({ hasActiveStay: false, activeBooking: null, housekeepingStatus: 'ok' }), 'free');
  });
});
