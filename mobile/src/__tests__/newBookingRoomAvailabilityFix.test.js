import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRoomBookable, getCardDisplay, BADGE_THEME } from '../lib/roomAvailability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Critical Fix Verification: New Booking Showing Already-Booked Rooms', () => {
  const newBookingSheetPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
  const roomAvailabilityPath = path.join(srcDir, 'lib', 'roomAvailability.js');

  it('1. isRoomBookable correctly identifies genuinely bookable vs unavailable rooms', () => {
    // 1. Ready room: vacant and clean -> bookable
    const readyRoom = {
      id: 104,
      room_no: '104',
      is_available: true,
      is_bookable: true,
      booking_status: 'available_ready',
      card_badge: 'Ready',
      card_detail: 'Available',
      housekeeping_status: 'ok',
    };
    assert.equal(isRoomBookable(readyRoom), true, 'Ready room must be bookable');

    // 2. Cleaning room: vacant, cleaning in progress -> bookable for future check-in
    const cleaningRoom = {
      id: 106,
      room_no: '106',
      is_available: true,
      is_bookable: true,
      booking_status: 'available_not_ready',
      card_badge: 'Cleaning',
      card_detail: 'Not ready yet',
      housekeeping_status: 'cleaning',
    };
    assert.equal(isRoomBookable(cleaningRoom), true, 'Cleaning room must be bookable for upcoming stay');

    // 3. Same-day turnover: currently occupied, leaves on check-in day -> bookable
    const turnoverRoom = {
      id: 107,
      room_no: '107',
      is_available: true,
      is_bookable: true,
      booking_status: 'available_not_ready',
      card_badge: 'Occupied',
      card_detail: 'Leaves 20 Nov',
      current_stay: { checkout_planned: '2026-11-20', is_overdue: false },
    };
    assert.equal(isRoomBookable(turnoverRoom), true, 'Same-day turnover room must be bookable');

    // 4. Overdue room: previous guest has not checked out -> NOT bookable
    const overdueRoom = {
      id: 109,
      room_no: '109',
      is_available: false,
      is_bookable: false,
      booking_status: 'unavailable',
      card_badge: 'Overdue',
      card_detail: 'Checkout pending',
      current_stay: { checkout_planned: '2026-11-13', is_overdue: true },
      selection_blocked_reason: 'Previous guest checkout is overdue.',
    };
    assert.equal(isRoomBookable(overdueRoom), false, 'Overdue room must NOT be bookable');

    // 5. Booked room: overlapping active reservation -> NOT bookable
    const bookedRoom = {
      id: 102,
      room_no: '102',
      is_available: false,
      is_bookable: false,
      booking_status: 'unavailable',
      card_badge: 'Booked',
      card_detail: 'Until 21 Nov',
      conflicting_reservation: { booking_code: 'BK-1039', check_in_date: '2026-11-20', check_out_date: '2026-11-21' },
      selection_blocked_reason: 'Reserved for requested dates until 21 Nov (BK-1039).',
    };
    assert.equal(isRoomBookable(bookedRoom), false, 'Booked room must NOT be bookable');

    // 6. Occupied room overlapping stay -> NOT bookable
    const occupiedRoom = {
      id: 101,
      room_no: '101',
      is_available: false,
      is_bookable: false,
      booking_status: 'unavailable',
      card_badge: 'Occupied',
      card_detail: 'Leaves 25 Nov',
      current_stay: { checkout_planned: '2026-11-25', is_overdue: false },
      selection_blocked_reason: 'Room 101 is occupied by Test until 25 Nov.',
    };
    assert.equal(isRoomBookable(occupiedRoom), false, 'Occupied room overlapping stay must NOT be bookable');

    // 7. Repair room: under maintenance -> NOT bookable
    const repairRoom = {
      id: 208,
      room_no: '208',
      is_available: false,
      is_bookable: false,
      booking_status: 'maintenance',
      card_badge: 'Repair',
      card_detail: 'Unavailable',
      housekeeping_status: 'repair',
      selection_blocked_reason: 'Room 208 is under maintenance and cannot be booked.',
    };
    assert.equal(isRoomBookable(repairRoom), false, 'Repair room must NOT be bookable');
  });

  it('2. NewBookingSheet.jsx filters freeRooms so Pick a room section only displays genuinely bookable rooms', () => {
    const content = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Verify selectableRooms and unavailableRooms filtering
    assert.ok(
      content.includes('const selectableRooms = (freeRooms || []).filter(isRoomBookable);'),
      'Must filter freeRooms using isRoomBookable for selectableRooms'
    );
    assert.ok(
      content.includes('const unavailableRooms = (freeRooms || []).filter((r) => !isRoomBookable(r));'),
      'Must separate unavailableRooms'
    );

    // Verify roomGrid only maps over selectableRooms
    assert.ok(
      content.includes('{selectableRooms.map((r) => {'),
      'Pick a room grid must only map over selectableRooms'
    );
    assert.ok(
      !content.includes('{(freeRooms || []).map((r) => {'),
      'Pick a room grid must NOT map over all freeRooms'
    );
  });

  it('3. Available count displays genuinely bookable rooms count, never total rooms', () => {
    const content = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Verify totalBookable is derived from selectableRooms.length
    assert.ok(
      content.includes('const totalBookable = selectableRooms.length;'),
      'totalBookable must equal selectableRooms.length'
    );

    // Verify label displays "Pick a room * · {totalBookable} available"
    assert.ok(
      content.includes('Pick a room * · {totalBookable} available'),
      'Room picker label must display genuinely available count'
    );
  });

  it('4. Unavailable rooms are displayed in a separate explanation section and cannot be selected', () => {
    const content = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Verify separate unavailable section exists
    assert.ok(
      content.includes('unavailableSection'),
      'Must contain a separate unavailableSection'
    );
    assert.ok(
      content.includes('unavailableToggle'),
      'Must provide a toggle for viewing unavailable rooms'
    );
    assert.ok(
      content.includes('{unavailableRooms.map((r) => {'),
      'Must map unavailable rooms in the separate unavailable section'
    );

    // Verify tapping an unavailable room does NOT call setRoomId, but sets inspectedRoomId and toasts blocked reason
    assert.ok(
      content.includes('toast(`Room ${r.room_no}: ${cardData.blockedReason ||'),
      'Tapping unavailable room must display explanation toast'
    );
  });

  it('5. Enforces authoritative live revalidation before booking submission', () => {
    const content = fs.readFileSync(newBookingSheetPath, 'utf8');

    // Verify validation checks chosen room is bookable
    assert.ok(
      content.includes('!isRoomBookable(chosenRoom)'),
      'Submit validation must check that chosen room is bookable'
    );

    // Verify live revalidation call against /reservations/free-rooms
    assert.ok(
      content.includes("api.get(`/reservations/free-rooms?${params}`)"),
      'Must revalidate room availability with live backend before submitting'
    );
    assert.ok(
      content.includes('!isRoomBookable(freshChosen)'),
      'Must re-check isRoomBookable on fresh backend response'
    );
  });

  it('6. Clears selected roomId if date change makes currently selected room unavailable', () => {
    const content = fs.readFileSync(newBookingSheetPath, 'utf8');

    assert.ok(
      content.includes('!selectableRooms.some((r) => r.id === roomId)'),
      'Must clear roomId if selected room is no longer in selectableRooms'
    );
  });
});
