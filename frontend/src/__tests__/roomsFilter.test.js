import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Rooms Filter and State Derivation Logic (All Active Bookings)', () => {
  const roomMatchesFilter = (r, f) => {
    if (f === 'all') return true;
    if (f === 'booked') return r.status === 'booked' || r.hasPendingBooking === true;
    if (f === 'occupied') return r.status === 'occupied';
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

  it('matches an occupied room with a pending reservation in both Booked and Occupied filters', () => {
    const room101 = {
      id: 1,
      roomNo: 101,
      status: 'occupied',
      guestName: 'Madhavi',
      hasPendingBooking: true,
      pendingBooking: {
        id: 806,
        bookingCode: 'BK-1806',
        guestName: 'Ramya',
        checkInDate: '2026-11-08',
        checkOutDate: '2026-11-10',
      },
    };

    // 1. Matches Booked filter because hasPendingBooking is true
    assert.equal(roomMatchesFilter(room101, 'booked'), true);

    // 2. Matches Occupied filter because status is occupied
    assert.equal(roomMatchesFilter(room101, 'occupied'), true);

    // 3. Matches All filter
    assert.equal(roomMatchesFilter(room101, 'all'), true);

    // 4. Does not match other filters
    assert.equal(roomMatchesFilter(room101, 'cleaning'), false);
    assert.equal(roomMatchesFilter(room101, 'repair'), false);
    assert.equal(roomMatchesFilter(room101, 'free'), false);
  });

  it('does not match Booked filter when room is occupied without a pending reservation', () => {
    const occupiedRoomWithoutBooking = {
      id: 2,
      roomNo: 102,
      status: 'occupied',
      guestName: 'Another Guest',
      hasPendingBooking: false,
      pendingBooking: null,
    };

    assert.equal(roomMatchesFilter(occupiedRoomWithoutBooking, 'occupied'), true);
    assert.equal(roomMatchesFilter(occupiedRoomWithoutBooking, 'booked'), false);
  });

  it('keeps room primary status as occupied when active stay exists even with pending booking', () => {
    const status = deriveRoomStatus({
      hasActiveStay: true,
      activeBooking: { id: 806, status: 'pending' },
      housekeepingStatus: 'ok',
    });
    assert.equal(status, 'occupied', 'Primary status must remain occupied');
  });

  it('correctly handles pending booking indicator data structure', () => {
    const room101 = {
      id: 1,
      roomNo: 101,
      status: 'occupied',
      guestName: 'Madhavi',
      hasPendingBooking: true,
      pendingBooking: {
        id: 806,
        bookingCode: 'BK-1806',
        guestName: 'Ramya',
        checkInDate: '2026-11-08',
        checkOutDate: '2026-11-10',
      },
    };

    assert.equal(room101.hasPendingBooking, true);
    assert.ok(room101.pendingBooking);
    assert.equal(room101.pendingBooking.bookingCode, 'BK-1806');
    assert.equal(room101.pendingBooking.guestName, 'Ramya');
    assert.equal(room101.pendingBooking.id, 806);
  });
});
