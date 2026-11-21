import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getHotelNow,
  getConfiguredCheckoutTime,
  formatTime12h,
  isRoomOverdue,
  getOverdueDetails,
} from '../lib/overdue.js';

describe('Rooms Dashboard - Overdue Status and Calculation Parity Verification', () => {
  // Mock Hotel Settings: 11:00 AM checkout in Asia/Kolkata timezone
  const defaultSettings = {
    settings: {
      checkout_hour: 11,
      timezone: 'Asia/Kolkata',
    },
  };

  // Helper to create a specific timestamp in Asia/Kolkata (UTC+5:30)
  // Date string format: YYYY-MM-DDTHH:mm:ss+05:30
  const createKolkataTime = (isoString) => new Date(isoString);

  // -------------------------------------------------------------------------
  // Scenario 1: Occupied guest before scheduled checkout time
  // -------------------------------------------------------------------------
  it('1. Occupied guest before scheduled checkout time is NOT overdue', () => {
    // Current time: 2026-11-20 10:45:00 AM IST
    const now = createKolkataTime('2026-11-20T10:45:00+05:30');

    const occupiedRoom = {
      id: 101,
      roomNo: 101,
      status: 'occupied',
      stayId: 501,
      guestName: 'Arjun Mehta',
      bookingCode: 'BK-0501',
      checkoutPlanned: '2026-11-20',
      checkoutTime: '11:00:00',
    };

    const overdue = isRoomOverdue(occupiedRoom, defaultSettings, now);
    assert.equal(overdue, false, 'Guest before checkout time (10:45 AM < 11:00 AM) must NOT be overdue');

    const details = getOverdueDetails(occupiedRoom, defaultSettings, now);
    assert.equal(details.isOverdue, false);
    assert.equal(details.badgeText, null);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Occupied guest exactly at checkout time
  // -------------------------------------------------------------------------
  it('2. Occupied guest exactly at checkout time IS overdue', () => {
    // Current time: 2026-11-20 11:00:00 AM IST
    const now = createKolkataTime('2026-11-20T11:00:00+05:30');

    const occupiedRoom = {
      id: 102,
      roomNo: 102,
      status: 'occupied',
      stayId: 502,
      guestName: 'Priya Sharma',
      bookingCode: 'BK-0502',
      checkoutPlanned: '2026-11-20',
      checkoutTime: '11:00:00',
    };

    const overdue = isRoomOverdue(occupiedRoom, defaultSettings, now);
    assert.equal(overdue, true, 'Guest exactly at checkout time (11:00 AM) must be marked overdue');

    const details = getOverdueDetails(occupiedRoom, defaultSettings, now);
    assert.equal(details.isOverdue, true);
    assert.equal(details.overdueDays, 0, 'Same day overdue has 0 full days');
    assert.equal(details.badgeText, 'OVERDUE');
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Occupied guest after checkout time
  // -------------------------------------------------------------------------
  it('3. Occupied guest after checkout time IS overdue', () => {
    // Current time: 2026-11-20 12:30:00 PM IST
    const now = createKolkataTime('2026-11-20T12:30:00+05:30');

    const occupiedRoom = {
      id: 103,
      roomNo: 103,
      status: 'occupied',
      stayId: 503,
      guestName: 'Rahul Verma',
      bookingCode: 'BK-0503',
      checkoutPlanned: '2026-11-20',
      checkoutTime: '11:00:00',
    };

    const overdue = isRoomOverdue(occupiedRoom, defaultSettings, now);
    assert.equal(overdue, true, 'Guest after checkout time (12:30 PM > 11:00 AM) must be marked overdue');

    const details = getOverdueDetails(occupiedRoom, defaultSettings, now);
    assert.equal(details.isOverdue, true);
    assert.equal(details.badgeText, 'OVERDUE');
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Guest who checks out successfully
  // -------------------------------------------------------------------------
  it('4. Guest who checks out successfully is NOT marked overdue', () => {
    const now = createKolkataTime('2026-11-20T14:00:00+05:30');

    // Room after checkout is transitioned to cleaning or free, status is no longer occupied
    const checkedOutRoomCleaning = {
      id: 104,
      roomNo: 104,
      status: 'cleaning',
      stayId: null,
      guestName: null,
      checkoutPlanned: '2026-11-20',
    };

    const checkedOutRoomFree = {
      id: 105,
      roomNo: 105,
      status: 'free',
      stayId: null,
      guestName: null,
      checkoutPlanned: null,
    };

    assert.equal(isRoomOverdue(checkedOutRoomCleaning, defaultSettings, now), false);
    assert.equal(isRoomOverdue(checkedOutRoomFree, defaultSettings, now), false);

    // Also verify pending reservation on a room is NOT marked overdue
    const pendingBookingRoom = {
      id: 106,
      roomNo: 106,
      status: 'booked',
      stayId: null,
      guestName: 'Pending Guest',
      checkoutPlanned: '2026-11-20',
      hasPendingBooking: true,
    };
    assert.equal(isRoomOverdue(pendingBookingRoom, defaultSettings, now), false, 'Pending bookings are not overdue stays');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Guest with a future checkout date
  // -------------------------------------------------------------------------
  it('5. Guest with a future checkout date is NOT overdue', () => {
    // Current time: 2026-11-20 16:00:00 PM IST
    const now = createKolkataTime('2026-11-20T16:00:00+05:30');

    const futureStayRoom = {
      id: 201,
      roomNo: 201,
      status: 'occupied',
      stayId: 601,
      guestName: 'Sunita Rao',
      bookingCode: 'BK-0601',
      checkoutPlanned: '2026-11-23', // 3 days in future
      checkoutTime: '11:00:00',
    };

    const overdue = isRoomOverdue(futureStayRoom, defaultSettings, now);
    assert.equal(overdue, false, 'Future checkout date (23 Nov > 20 Nov) must NOT be overdue');

    const details = getOverdueDetails(futureStayRoom, defaultSettings, now);
    assert.equal(details.isOverdue, false);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Guest with a past checkout date
  // -------------------------------------------------------------------------
  it('6. Guest with a past checkout date IS overdue with correct duration', () => {
    // Current time: 2026-11-20 09:00:00 AM IST
    const now = createKolkataTime('2026-11-20T09:00:00+05:30');

    const pastCheckoutRoom = {
      id: 207,
      roomNo: 207,
      status: 'occupied',
      stayId: 607,
      guestName: 'Luxy',
      bookingCode: 'BK-0607',
      checkoutPlanned: '2026-11-18', // 2 days in past
      checkoutTime: '11:00:00',
    };

    const overdue = isRoomOverdue(pastCheckoutRoom, defaultSettings, now);
    assert.equal(overdue, true, 'Past checkout date (18 Nov < 20 Nov) must be overdue');

    const details = getOverdueDetails(pastCheckoutRoom, defaultSettings, now);
    assert.equal(details.isOverdue, true);
    assert.equal(details.overdueDays, 2, 'Must calculate 2 days overdue');
    assert.equal(details.badgeText, '2d overdue');
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Different configured checkout times
  // -------------------------------------------------------------------------
  it('7. Different configured checkout times in Hotel Settings dynamically shift overdue boundary', () => {
    // Current time: 2026-11-20 12:30:00 PM IST
    const now = createKolkataTime('2026-11-20T12:30:00+05:30');

    const room = {
      id: 301,
      roomNo: 301,
      status: 'occupied',
      stayId: 701,
      guestName: 'Test Guest',
      checkoutPlanned: '2026-11-20',
    };

    // Case A: Hotel Settings configured for 14:00 (2:00 PM) checkout
    const settingsLateCheckout = {
      settings: {
        checkout_hour: 14,
        timezone: 'Asia/Kolkata',
      },
    };
    assert.equal(
      isRoomOverdue(room, settingsLateCheckout, now),
      false,
      'At 12:30 PM with 2:00 PM checkout, room must NOT be overdue'
    );

    // Case B: Hotel Settings configured for 10:00 (10:00 AM) checkout
    const settingsEarlyCheckout = {
      settings: {
        checkout_hour: 10,
        timezone: 'Asia/Kolkata',
      },
    };
    assert.equal(
      isRoomOverdue(room, settingsEarlyCheckout, now),
      true,
      'At 12:30 PM with 10:00 AM checkout, room MUST be overdue'
    );

    // Case C: Hotel Settings configured for 12:00 (12:00 PM noon) checkout
    const settingsNoonCheckout = {
      settings: {
        checkout_hour: 12,
        timezone: 'Asia/Kolkata',
      },
    };
    assert.equal(
      isRoomOverdue(room, settingsNoonCheckout, now),
      true,
      'At 12:30 PM with 12:00 PM checkout, room MUST be overdue'
    );
  });

  // -------------------------------------------------------------------------
  // Scenario 8: Multiple overdue rooms
  // -------------------------------------------------------------------------
  it('8. Multiple overdue rooms correctly aggregate in dashboard count and filter', () => {
    // Current time: 2026-11-20 15:00:00 IST
    const now = createKolkataTime('2026-11-20T15:00:00+05:30');

    const rooms = [
      { id: 101, roomNo: 101, status: 'free' },
      { id: 102, roomNo: 102, status: 'occupied', stayId: 1, checkoutPlanned: '2026-11-18', guestName: 'Guest 1', bookingCode: 'BK-1' }, // Overdue (past date)
      { id: 103, roomNo: 103, status: 'occupied', stayId: 2, checkoutPlanned: '2026-11-20', guestName: 'Guest 2', bookingCode: 'BK-2' }, // Overdue (past 11 AM)
      { id: 104, roomNo: 104, status: 'occupied', stayId: 3, checkoutPlanned: '2026-11-22', guestName: 'Guest 3', bookingCode: 'BK-3' }, // Not overdue (future)
      { id: 105, roomNo: 105, status: 'cleaning' },
      { id: 106, roomNo: 106, status: 'repair' },
      { id: 107, roomNo: 107, status: 'booked', hasPendingBooking: true },
    ];

    const enriched = rooms.map((r) => ({
      ...r,
      isOverdue: isRoomOverdue(r, defaultSettings, now),
    }));

    // Check count calculation matching RoomsScreen
    const counts = { free: 0, booked: 0, occupied: 0, cleaning: 0, repair: 0, overdue: 0 };
    enriched.forEach((r) => {
      if (counts[r.status] !== undefined) counts[r.status]++;
      if (r.isOverdue) counts.overdue++;
    });

    assert.equal(counts.free, 1);
    assert.equal(counts.occupied, 3);
    assert.equal(counts.cleaning, 1);
    assert.equal(counts.repair, 1);
    assert.equal(counts.booked, 1);
    assert.equal(counts.overdue, 2, 'Exactly 2 rooms must be counted as overdue');

    // Filter by 'overdue'
    const overdueFiltered = enriched.filter((r) => Boolean(r.isOverdue));
    assert.equal(overdueFiltered.length, 2);
    assert.deepEqual(overdueFiltered.map((r) => r.roomNo), [102, 103]);

    // Verify booking reference and guest details are preserved
    assert.equal(overdueFiltered[0].bookingCode, 'BK-1');
    assert.equal(overdueFiltered[0].guestName, 'Guest 1');
    assert.equal(overdueFiltered[1].bookingCode, 'BK-2');
    assert.equal(overdueFiltered[1].guestName, 'Guest 2');
  });

  // -------------------------------------------------------------------------
  // Scenario 9: Primary room status remains OCCUPIED with OVERDUE badge
  // -------------------------------------------------------------------------
  it('9. Overdue rooms preserve primary status as OCCUPIED while showing OVERDUE badge', () => {
    const now = createKolkataTime('2026-11-20T13:00:00+05:30');

    const overdueRoom = {
      id: 208,
      roomNo: 208,
      status: 'occupied',
      stayId: 88,
      guestName: 'Kavitha',
      checkoutPlanned: '2026-11-20',
      checkoutTime: '11:00:00',
    };

    assert.equal(overdueRoom.status, 'occupied', 'Primary room status must remain occupied');
    assert.equal(isRoomOverdue(overdueRoom, defaultSettings, now), true);

    const details = getOverdueDetails(overdueRoom, defaultSettings, now);
    assert.equal(details.isOverdue, true);
    assert.equal(details.badgeText, 'OVERDUE');
    assert.equal(details.formattedTime, '11:00 AM');
  });

  // -------------------------------------------------------------------------
  // Scenario 10: Timezone handling across different hotel locations
  // -------------------------------------------------------------------------
  it('10. Correctly evaluates current time in hotel configured timezone', () => {
    // 2026-11-20 15:30:00 UTC
    // In Asia/Kolkata (UTC+5:30) => 2026-11-20 21:00:00 (overdue for 11 AM)
    // In America/New_York (UTC-5:00) => 2026-11-20 10:30:00 (NOT overdue for 11 AM)
    const utcDate = new Date('2026-11-20T15:30:00Z');

    const room = {
      id: 401,
      roomNo: 401,
      status: 'occupied',
      stayId: 99,
      checkoutPlanned: '2026-11-20',
    };

    const kolkataSettings = { settings: { checkout_hour: 11, timezone: 'Asia/Kolkata' } };
    const newYorkSettings = { settings: { checkout_hour: 11, timezone: 'America/New_York' } };

    assert.equal(
      isRoomOverdue(room, kolkataSettings, utcDate),
      true,
      'In Kolkata, 15:30 UTC is 21:00 local -> past 11:00 AM checkout -> overdue'
    );
    assert.equal(
      isRoomOverdue(room, newYorkSettings, utcDate),
      false,
      'In New York, 15:30 UTC is 10:30 local -> before 11:00 AM checkout -> NOT overdue'
    );
  });
});
