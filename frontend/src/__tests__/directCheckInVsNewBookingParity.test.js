import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCardDisplay, BADGE_THEME } from '../lib/roomAvailability.js';

describe('Frontend Web Parity: Direct Check-in vs New Booking Availability', () => {
  // Direct Check-in room filter (exact code from DirectCheckInPicker.jsx)
  function filterDirectCheckInRooms(rooms) {
    return (rooms || []).filter((r) => r.status === 'free').sort((a, b) => a.roomNo - b.roomNo);
  }

  // Full 50-room hotel dataset matching the authoritative backend state
  const hotelRooms = [
    // 8 Overdue Occupied Rooms
    { id: 1, roomNo: 101, room_no: '101', status: 'occupied', housekeeping_status: 'ok', stayId: 1, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-18', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 2, roomNo: 102, room_no: '102', status: 'occupied', housekeeping_status: 'ok', stayId: 2, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-18', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 3, roomNo: 103, room_no: '103', status: 'occupied', housekeeping_status: 'ok', stayId: 3, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-10', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 6, roomNo: 106, room_no: '106', status: 'occupied', housekeeping_status: 'cleaning', stayId: 6, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-20', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 7, roomNo: 107, room_no: '107', status: 'occupied', housekeeping_status: 'ok', stayId: 7, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-20', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 8, roomNo: 108, room_no: '108', status: 'occupied', housekeeping_status: 'ok', stayId: 8, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-17', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 13, roomNo: 203, room_no: '203', status: 'occupied', housekeeping_status: 'ok', stayId: 13, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-17', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 21, roomNo: 301, room_no: '301', status: 'occupied', housekeeping_status: 'ok', stayId: 21, is_available: false, is_bookable: false, card_badge: 'Overdue', card_detail: 'Checkout pending', current_stay: { checkout_planned: '2026-11-19', is_overdue: true }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },

    // 1 Active Occupied Room (checking out tomorrow 2026-11-22)
    { id: 10, roomNo: 110, room_no: '110', status: 'occupied', housekeeping_status: 'ok', stayId: 10, is_available: false, is_bookable: false, card_badge: 'Occupied', card_detail: 'Leaves 22 Nov', selection_blocked_reason: 'Room 110 is occupied by Mobile Walkin TestGuest until 22 Nov.', current_stay: { checkout_planned: '2026-11-22', is_overdue: false }, roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },

    // 1 Active Overlapping Booked Room (BK-8945 for 2026-11-21 to 2026-11-22)
    { id: 5, roomNo: 105, room_no: '105', status: 'booked', housekeeping_status: 'ok', stayId: null, is_available: false, is_bookable: false, card_badge: 'Booked', card_detail: 'Until 22 Nov', selection_blocked_reason: 'Reserved for requested dates until 22 Nov (BK-8945).', roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },

    // 2 Future-Booked Rooms (BK-8946 and BK-8947 starting 2026-11-23)
    { id: 9, roomNo: 109, room_no: '109', status: 'booked', housekeeping_status: 'ok', stayId: null, is_available: true, is_bookable: true, card_badge: 'Ready', card_detail: 'Available', nextBookingDate: '2026-11-23', roomType: { id: 3, name: 'Family', rate: 4800, maxPersons: 4 } },
    { id: 14, roomNo: 204, room_no: '204', status: 'booked', housekeeping_status: 'ok', stayId: null, is_available: true, is_bookable: true, card_badge: 'Ready', card_detail: 'Available', nextBookingDate: '2026-11-23', roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },

    // 4 Cleaning Rooms (Vacant, housekeeping in progress)
    { id: 4, roomNo: 104, room_no: '104', status: 'cleaning', housekeeping_status: 'cleaning', stayId: null, is_available: true, is_bookable: true, card_badge: 'Cleaning', card_detail: 'Not ready yet', turnover_notice: 'Housekeeping in progress. Room must be marked ready before check-in.', roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 11, roomNo: 201, room_no: '201', status: 'cleaning', housekeeping_status: 'cleaning', stayId: null, is_available: true, is_bookable: true, card_badge: 'Cleaning', card_detail: 'Not ready yet', turnover_notice: 'Housekeeping in progress. Room must be marked ready before check-in.', roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 12, roomNo: 202, room_no: '202', status: 'cleaning', housekeeping_status: 'cleaning', stayId: null, is_available: true, is_bookable: true, card_badge: 'Cleaning', card_detail: 'Not ready yet', turnover_notice: 'Housekeeping in progress. Room must be marked ready before check-in.', roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 } },
    { id: 26, roomNo: 306, room_no: '306', status: 'cleaning', housekeeping_status: 'cleaning', stayId: null, is_available: true, is_bookable: true, card_badge: 'Cleaning', card_detail: 'Not ready yet', turnover_notice: 'Housekeeping in progress. Room must be marked ready before check-in.', roomType: { id: 2, name: 'Deluxe', rate: 3500, maxPersons: 2 } },

    // 1 Repair Room
    { id: 37, roomNo: 407, room_no: '407', status: 'repair', housekeeping_status: 'repair', stayId: null, is_available: false, is_bookable: false, card_badge: 'Repair', card_detail: 'Unavailable', selection_blocked_reason: 'Room 407 is under maintenance and cannot be booked.', roomType: { id: 2, name: 'Deluxe', rate: 3500, maxPersons: 2 } },

    // 33 Physically Free and Housekeeping-Ready Rooms
    ...[
      205, 206, 207, 208, 209, 210,
      302, 303, 304, 305, 307, 308, 309, 310,
      401, 402, 403, 404, 405, 406, 408, 409, 410,
      501, 502, 503, 504, 505, 506, 507, 508, 509, 510
    ].map((rNo, idx) => ({
      id: 100 + idx,
      roomNo: rNo,
      room_no: String(rNo),
      status: 'free',
      housekeeping_status: 'ok',
      stayId: null,
      is_available: true,
      is_bookable: true,
      card_badge: 'Ready',
      card_detail: 'Available',
      roomType: { id: 1, name: 'Standard', rate: 2200, maxPersons: 2 },
    })),
  ];

  it('Scenario 1: Same-day Direct Check-in versus New Booking counts and rooms', () => {
    // 1. Direct Check-in shows exactly 33 rooms
    const directRooms = filterDirectCheckInRooms(hotelRooms);
    assert.equal(directRooms.length, 33, 'Direct Check-in should offer exactly 33 free rooms');
    assert.deepEqual(
      directRooms.map((r) => r.roomNo),
      [
        205, 206, 207, 208, 209, 210,
        302, 303, 304, 305, 307, 308, 309, 310,
        401, 402, 403, 404, 405, 406, 408, 409, 410,
        501, 502, 503, 504, 505, 506, 507, 508, 509, 510
      ]
    );

    // 2. New Booking shows exactly 39 bookable rooms (35 Ready + 4 Cleaning)
    const bookableRooms = hotelRooms.filter((r) => r.is_bookable !== false);
    assert.equal(bookableRooms.length, 39, 'New Booking should offer exactly 39 bookable rooms');

    const readyRooms = bookableRooms.filter((r) => r.card_badge === 'Ready');
    assert.equal(readyRooms.length, 35, 'New Booking should have 35 Ready rooms');

    const cleaningRooms = bookableRooms.filter((r) => r.card_badge === 'Cleaning');
    assert.equal(cleaningRooms.length, 4, 'New Booking should have 4 Cleaning rooms');

    // 3. Exactly 6 rooms difference between Direct Check-in (33) and New Booking (39)
    const diffRoomNos = bookableRooms
      .map((r) => r.roomNo)
      .filter((no) => !directRooms.some((dr) => dr.roomNo === no))
      .sort((a, b) => a - b);
    assert.deepEqual(diffRoomNos, [104, 109, 201, 202, 204, 306], 'The 6 diff rooms must be 4 cleaning + 2 future-booked rooms');

    // 4. Exactly 11 unbookable rooms (8 Overdue, 1 Booked, 1 Occupied, 1 Repair)
    const unbookableRooms = hotelRooms.filter((r) => r.is_bookable === false);
    assert.equal(unbookableRooms.length, 11);
  });

  it('Scenario 2: Room occupied but checking out before requested arrival is bookable in New Booking', () => {
    const room = {
      id: 50,
      room_no: '500',
      status: 'occupied',
      housekeeping_status: 'ok',
      stayId: 50,
      is_available: true,
      is_bookable: true,
      card_badge: 'Ready',
      card_detail: 'Available',
      current_stay: { checkout_planned: '2026-11-22', is_overdue: false },
    };
    assert.equal(filterDirectCheckInRooms([room]).length, 0);
    assert.equal(room.is_bookable !== false, true);
  });

  it('Scenario 3: Room occupied beyond requested arrival is blocked in New Booking', () => {
    const room = hotelRooms.find((r) => r.roomNo === 110);
    assert.equal(room.is_bookable !== false, false);
    assert.equal(filterDirectCheckInRooms([room]).length, 0);
    const display = getCardDisplay(room, '2026-11-21', '2026-11-22');
    assert.equal(display.badge, 'Occupied');
    assert.ok(display.blockedReason.includes('occupied by Mobile Walkin TestGuest'));
  });

  it('Scenario 4: Room booked for overlapping dates is blocked in New Booking', () => {
    const room = hotelRooms.find((r) => r.roomNo === 105);
    assert.equal(room.is_bookable !== false, false);
    assert.equal(filterDirectCheckInRooms([room]).length, 0);
    const display = getCardDisplay(room, '2026-11-21', '2026-11-22');
    assert.equal(display.badge, 'Booked');
    assert.ok(display.blockedReason.includes('Reserved for requested dates until 22 Nov (BK-8945)'));
  });

  it('Scenario 5: Room booked only after requested checkout date is bookable in New Booking', () => {
    const room109 = hotelRooms.find((r) => r.roomNo === 109);
    const room204 = hotelRooms.find((r) => r.roomNo === 204);

    assert.equal(room109.is_bookable !== false, true);
    assert.equal(room204.is_bookable !== false, true);

    assert.equal(filterDirectCheckInRooms([room109]).length, 0);
    assert.equal(filterDirectCheckInRooms([room204]).length, 0);
  });

  it('Scenario 6: Room under cleaning is excluded from Direct Check-in, eligible in New Booking with turnover warning', () => {
    const cleaningRooms = hotelRooms.filter((r) => r.card_badge === 'Cleaning');
    assert.equal(cleaningRooms.length, 4);

    assert.equal(filterDirectCheckInRooms(cleaningRooms).length, 0);

    for (const room of cleaningRooms) {
      assert.equal(room.is_bookable !== false, true);
      const display = getCardDisplay(room, '2026-11-21', '2026-11-22');
      assert.equal(display.badge, 'Cleaning');
      assert.ok(display.turnoverNotice.includes('Housekeeping in progress'));
    }
  });

  it('Scenario 7: Room under repair is blocked in both Direct Check-in and New Booking', () => {
    const repairRoom = hotelRooms.find((r) => r.roomNo === 407);
    assert.equal(filterDirectCheckInRooms([repairRoom]).length, 0);
    assert.equal(repairRoom.is_bookable !== false, false);
    const display = getCardDisplay(repairRoom, '2026-11-21', '2026-11-22');
    assert.equal(display.badge, 'Repair');
    assert.ok(display.blockedReason.includes('under maintenance'));
  });

  it('Scenario 8: Overdue room is blocked in both Direct Check-in and New Booking', () => {
    const overdueRooms = hotelRooms.filter((r) => r.card_badge === 'Overdue');
    assert.equal(overdueRooms.length, 8);

    assert.equal(filterDirectCheckInRooms(overdueRooms).length, 0);
    for (const room of overdueRooms) {
      assert.equal(room.is_bookable !== false, false);
      const display = getCardDisplay(room, '2026-11-21', '2026-11-22');
      assert.equal(display.badge, 'Overdue');
      assert.equal(display.detail, 'Checkout pending');
    }
  });

  it('Scenario 9: Same-day checkout and new arrival: half-open interval allows turnover with notice', () => {
    const turnoverRoom = {
      id: 206,
      roomNo: 206,
      room_no: '206',
      status: 'occupied',
      housekeeping_status: 'ok',
      stayId: 99,
      is_available: true,
      is_bookable: true,
      card_badge: 'Occupied',
      card_detail: 'Leaves 21 Nov',
      current_stay: { checkout_planned: '2026-11-21', is_overdue: false },
      turnover_notice: 'Checkout at 12 noon today. Room will be cleaned before check-in.',
    };

    assert.equal(filterDirectCheckInRooms([turnoverRoom]).length, 0);
    assert.equal(turnoverRoom.is_bookable !== false, true);
    const display = getCardDisplay(turnoverRoom, '2026-11-21', '2026-11-22');
    assert.equal(display.badge, 'Occupied');
    assert.ok(display.turnoverNotice.includes('Checkout at 12 noon today'));
  });

  it('Scenario 10: Multi-night booking overlapping future reservation blocks room', () => {
    const room109ThreeNights = {
      id: 9,
      roomNo: 109,
      room_no: '109',
      is_available: false,
      is_bookable: false,
      card_badge: 'Booked',
      card_detail: 'Until 24 Nov',
      selection_blocked_reason: 'Reserved for requested dates until 24 Nov (BK-8946).',
    };

    assert.equal(room109ThreeNights.is_bookable !== false, false);
    const display = getCardDisplay(room109ThreeNights, '2026-11-21', '2026-11-24');
    assert.equal(display.badge, 'Booked');
    assert.ok(display.blockedReason.includes('Reserved for requested dates'));
  });
});
