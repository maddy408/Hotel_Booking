import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCardDisplay, BADGE_THEME } from '../lib/roomAvailability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('KKK Lodge - Room Availability Parity & Verification', () => {
  const directPickerPath = path.join(srcDir, 'components', 'sheets', 'DirectCheckInPicker.jsx');
  const newBookingSheetPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
  const roomsScreenPath = path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx');

  // Helper simulating DirectCheckInPicker's room filtering logic
  function filterDirectCheckInRooms(rooms) {
    return (rooms || [])
      .filter((r) =>
        r.status === 'free' &&
        (r.housekeepingStatus || r.housekeeping_status || 'ok') === 'ok' &&
        !r.stayId &&
        r.status !== 'occupied' &&
        r.status !== 'booked' &&
        r.status !== 'cleaning' &&
        r.status !== 'repair'
      )
      .sort((a, b) => a.roomNo - b.roomNo);
  }

  // Helper checking half-open overlap interval rule:
  // existing_check_in < new_check_out AND existing_check_out > new_check_in
  function hasReservationOverlap(existingIn, existingOut, newIn, newOut) {
    return existingIn < newOut && existingOut > newIn;
  }

  it('1. Direct Check-in for 20 November 2026: only shows physically free and ready walk-in rooms', () => {
    const directContent = fs.readFileSync(directPickerPath, 'utf8');
    const roomsScreenContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Verify DirectCheckInPicker strict filtering
    assert.ok(
      directContent.includes("r.status === 'free'") &&
      directContent.includes("(r.housekeepingStatus || r.housekeeping_status || 'ok') === 'ok'") &&
      directContent.includes('!r.stayId') &&
      directContent.includes("r.status !== 'occupied'") &&
      directContent.includes("r.status !== 'cleaning'") &&
      directContent.includes("r.status !== 'repair'"),
      'DirectCheckInPicker must strictly exclude occupied, cleaning, repair, and booked rooms'
    );

    // Verify RoomsScreen passes baseRooms (today live) to DirectCheckInPicker
    assert.ok(
      roomsScreenContent.includes('<DirectCheckInPicker rooms={baseRooms}'),
      'RoomsScreen must pass baseRooms to DirectCheckInPicker so it reflects current physical availability'
    );

    // Sample rooms matching the user screenshot for 20 Nov 2026
    const sampleRooms = [
      { id: 101, roomNo: 101, status: 'occupied', housekeepingStatus: 'ok', stayId: 10, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 102, roomNo: 102, status: 'booked', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 107, roomNo: 107, status: 'cleaning', housekeepingStatus: 'cleaning', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 111, roomNo: 111, status: 'repair', housekeepingStatus: 'repair', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      // 15 Free rooms matching Screenshot 1
      { id: 402, roomNo: 402, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 404, roomNo: 404, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 405, roomNo: 405, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 602, roomNo: 602, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 603, roomNo: 603, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 604, roomNo: 604, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 605, roomNo: 605, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 607, roomNo: 607, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 608, roomNo: 608, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 609, roomNo: 609, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 610, roomNo: 610, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 1, name: 'Standard', rate: 2200 } },
      { id: 307, roomNo: 307, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 2, name: 'Deluxe', rate: 3500 } },
      { id: 407, roomNo: 407, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 2, name: 'Deluxe', rate: 3500 } },
      { id: 408, roomNo: 408, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 2, name: 'Deluxe', rate: 3500 } },
      { id: 409, roomNo: 409, status: 'free', housekeepingStatus: 'ok', stayId: null, roomType: { id: 3, name: 'Family', rate: 4800 } },
    ];

    const eligible = filterDirectCheckInRooms(sampleRooms);
    assert.equal(eligible.length, 15, 'Direct Check-in should offer exactly 15 free rooms');
    assert.deepEqual(
      eligible.map((r) => r.roomNo),
      [307, 402, 404, 405, 407, 408, 409, 602, 603, 604, 605, 607, 608, 609, 610]
    );
  });

  it('2. New Booking for 20-21 November 2026: evaluates availability over stay interval with status breakdown', () => {
    const newBookingContent = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Verify useFreeRooms hook parameters
    assert.ok(
      newBookingContent.includes('useFreeRooms({ checkIn, checkOut, roomTypeId: typeFilter'),
      'NewBookingSheet must query useFreeRooms with checkIn, checkOut, and roomTypeId'
    );

    // Verify status breakdown summary pills are present
    assert.ok(newBookingContent.includes('Ready ({readyCount})'), 'Must show Ready breakdown count');
    assert.ok(newBookingContent.includes('Occupied ({occupiedCount})'), 'Must show Occupied breakdown count');
    assert.ok(newBookingContent.includes('Cleaning ({cleaningCount})'), 'Must show Cleaning breakdown count');
    assert.ok(newBookingContent.includes('Booked ({bookedCount})'), 'Must show Booked breakdown count');
    assert.ok(newBookingContent.includes('Repair ({repairCount})'), 'Must show Repair breakdown count');

    // Verify inspectability: room tiles allow clicking any room to inspect details even if unbookable
    assert.ok(
      !newBookingContent.includes('disabled={!isBookable}'),
      'Room tiles must NOT be disabled so users can inspect unbookable rooms'
    );
    assert.ok(
      newBookingContent.includes('setInspectedRoomId(r.id)'),
      'Clicking a room must set inspectedRoomId to show room details'
    );
  });

  it('3. Room occupied until 21 November: overlaps requested stay [2026-11-20, 2026-11-21) and is blocked', () => {
    const existingIn = '2026-11-18';
    const existingOut = '2026-11-21';
    const newIn = '2026-11-20';
    const newOut = '2026-11-21';

    const overlaps = hasReservationOverlap(existingIn, existingOut, newIn, newOut);
    assert.equal(overlaps, true, 'Active stay until 21 Nov must overlap stay arriving 20 Nov');

    const room = {
      id: 101,
      room_no: '101',
      card_badge: 'Occupied',
      card_detail: 'Leaves 21 Nov',
      card_condition: 'stay',
      is_bookable: false,
      selection_blocked_reason: 'Currently occupied until 21 Nov. Cannot book overlapping dates.',
    };

    const display = getCardDisplay(room, newIn, newOut);
    assert.equal(display.badge, 'Occupied');
    assert.equal(display.blockedReason, 'Currently occupied until 21 Nov. Cannot book overlapping dates.');
  });

  it('4. Room booked until 21 November: overlaps requested stay and is unbookable with reason', () => {
    const existingIn = '2026-11-19';
    const existingOut = '2026-11-21';
    const newIn = '2026-11-20';
    const newOut = '2026-11-21';

    const overlaps = hasReservationOverlap(existingIn, existingOut, newIn, newOut);
    assert.equal(overlaps, true, 'Reservation until 21 Nov overlaps requested stay');

    const room = {
      id: 102,
      room_no: '102',
      card_badge: 'Booked',
      card_detail: 'Until 21 Nov',
      card_condition: 'reserved',
      is_bookable: false,
      selection_blocked_reason: 'Reserved for requested dates until 21 Nov.',
    };

    const display = getCardDisplay(room, newIn, newOut);
    assert.equal(display.badge, 'Booked');
    assert.equal(display.blockedReason, 'Reserved for requested dates until 21 Nov.');
  });

  it('5. Room booked beyond 21 November (e.g. from 22 Nov): does NOT overlap [2026-11-20, 2026-11-21) and IS bookable', () => {
    const existingIn = '2026-11-22';
    const existingOut = '2026-11-25';
    const newIn = '2026-11-20';
    const newOut = '2026-11-21';

    const overlaps = hasReservationOverlap(existingIn, existingOut, newIn, newOut);
    assert.equal(overlaps, false, 'Reservation starting 22 Nov must NOT overlap [20-21 Nov)');

    const room = {
      id: 103,
      room_no: '103',
      card_badge: 'Ready',
      card_detail: 'Available',
      card_condition: 'free_ready',
      is_bookable: true,
      selection_blocked_reason: null,
    };

    const display = getCardDisplay(room, newIn, newOut);
    assert.equal(display.badge, 'Ready');
    assert.equal(display.blockedReason, null);
  });

  it('6. Room under cleaning: excluded from Direct Check-in, available for New Booking with turnover warning', () => {
    const room = {
      id: 107,
      room_no: '107',
      status: 'cleaning',
      housekeeping_status: 'cleaning',
      card_badge: 'Cleaning',
      card_detail: 'Not ready yet',
      card_condition: 'cleaning',
      is_bookable: true,
      turnover_notice: 'Housekeeping in progress. Must be marked ready before check-in.',
    };

    // Direct check-in excludes it
    const directEligible = filterDirectCheckInRooms([room]);
    assert.equal(directEligible.length, 0, 'Direct Check-in must exclude dirty/cleaning rooms');

    // New booking allows it with warning
    const display = getCardDisplay(room, '2026-11-20', '2026-11-21');
    assert.equal(display.badge, 'Cleaning');
    assert.equal(display.turnoverNotice, 'Housekeeping in progress. Must be marked ready before check-in.');
  });

  it('7. Room under maintenance / repair: unavailable for both Direct Check-in and New Booking', () => {
    const room = {
      id: 111,
      room_no: '111',
      status: 'repair',
      housekeeping_status: 'repair',
      card_badge: 'Repair',
      card_detail: 'Unavailable',
      card_condition: 'maintenance',
      is_bookable: false,
      selection_blocked_reason: 'Room 111 is under maintenance.',
    };

    // Direct check-in excludes it
    const directEligible = filterDirectCheckInRooms([room]);
    assert.equal(directEligible.length, 0, 'Direct Check-in must exclude repair rooms');

    // New booking marks blocked
    const display = getCardDisplay(room, '2026-11-20', '2026-11-21');
    assert.equal(display.badge, 'Repair');
    assert.equal(display.blockedReason, 'Room 111 is under maintenance.');
  });

  it('8. Room marked Ready: vacant and clean, available in both Direct Check-in and New Booking', () => {
    const room = {
      id: 402,
      roomNo: 402,
      room_no: '402',
      status: 'free',
      housekeepingStatus: 'ok',
      housekeeping_status: 'ok',
      stayId: null,
      card_badge: 'Ready',
      card_detail: 'Available',
      card_condition: 'free_ready',
      is_bookable: true,
      selection_blocked_reason: null,
      roomType: { id: 1, name: 'Standard', rate: 2200 },
    };

    const directEligible = filterDirectCheckInRooms([room]);
    assert.equal(directEligible.length, 1, 'Ready room must be eligible for Direct Check-in');

    const display = getCardDisplay(room, '2026-11-20', '2026-11-21');
    assert.equal(display.badge, 'Ready');
    assert.equal(display.blockedReason, null);
  });

  it('9. Same-day checkout and new arrival: half-open interval allows turnover with notice', () => {
    // Current guest checks out on 20 Nov at 12 noon
    const existingIn = '2026-11-18';
    const existingOut = '2026-11-20';
    // New guest arrives on 20 Nov
    const newIn = '2026-11-20';
    const newOut = '2026-11-21';

    const overlaps = hasReservationOverlap(existingIn, existingOut, newIn, newOut);
    // 2026-11-18 < 2026-11-21 is TRUE, but 2026-11-20 > 2026-11-20 is FALSE!
    assert.equal(overlaps, false, 'Same-day checkout at turnover hour does not conflict under half-open interval');

    const room = {
      id: 206,
      room_no: '206',
      card_badge: 'Occupied',
      card_detail: 'Leaves 20 Nov',
      card_condition: 'turnover',
      is_bookable: true,
      turnover_notice: 'Checkout at 12 noon today. Room will be cleaned before check-in.',
    };

    const display = getCardDisplay(room, newIn, newOut);
    assert.equal(display.badge, 'Occupied');
    assert.equal(display.turnoverNotice, 'Checkout at 12 noon today. Room will be cleaned before check-in.');
  });

  it('10. Multiple rooms with different room types and rates: accurate grouping, rates, and badges', () => {
    const newBookingContent = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Details panel renders room type, rate, and max persons
    assert.ok(
      newBookingContent.includes('displayRoom.type_name || displayRoom.roomType?.name'),
      'Must display room type name in details panel'
    );
    assert.ok(
      newBookingContent.includes('displayRoom.type_rate || displayRoom.roomType?.rate'),
      'Must display room rate in details panel'
    );
    assert.ok(
      newBookingContent.includes('displayRoom.max_persons || displayRoom.roomType?.maxPersons'),
      'Must display max persons in details panel'
    );

    // Verify BADGE_THEME colors align with design
    assert.equal(BADGE_THEME.Ready.color, '#15803d');
    assert.equal(BADGE_THEME.Occupied.color, '#0369a1');
    assert.equal(BADGE_THEME.Booked.color, '#b45309');
    assert.equal(BADGE_THEME.Cleaning.color, '#6d28d9');
    assert.equal(BADGE_THEME.Repair.color, '#b91c1c');
  });
});
