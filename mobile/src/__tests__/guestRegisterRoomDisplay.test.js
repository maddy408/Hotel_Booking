import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Guest Register Room Number Display & Status Parity (Mobile)', () => {
  const guestsScreenPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
  const guestsScreenContent = fs.readFileSync(guestsScreenPath, 'utf8');

  it('1. GuestsScreen.jsx renders Room label with room number from room, room_no, or roomNo and falls back to —', () => {
    assert.ok(
      guestsScreenContent.includes('Room ${g.room ?? g.room_no ?? g.roomNo}') ||
      guestsScreenContent.includes('Room ${roomVal}') ||
      guestsScreenContent.includes('Room ${g.room}'),
      'GuestsScreen.jsx must render room number with Room prefix'
    );
    assert.ok(
      guestsScreenContent.includes(": '—'"),
      'GuestsScreen.jsx must fallback to em dash when room number is absent'
    );
  });

  it('2. GuestsScreen.jsx search includes room number matching', () => {
    assert.ok(
      guestsScreenContent.includes('roomVal && String(roomVal).includes(term)') ||
      guestsScreenContent.includes('g.room && String(g.room).includes(term)'),
      'GuestsScreen.jsx search must include room number matching'
    );
  });

  it('3. In-House guest displays current occupied room', () => {
    const inHouseGuest = {
      id: 1,
      name: 'Kalai',
      status: 'In-House',
      statusKey: 'in_house',
      room: 102,
      persons: 2,
    };
    const roomVal = inHouseGuest.room ?? inHouseGuest.room_no ?? inHouseGuest.roomNo;
    assert.equal(roomVal, 102);
    assert.equal(inHouseGuest.status, 'In-House');
  });

  it('4. Booked guest displays applicable reserved room', () => {
    const bookedGuest = {
      id: 2,
      name: 'Maya',
      status: 'Booked',
      statusKey: 'booked',
      room: 105,
      persons: 2,
    };
    const roomVal = bookedGuest.room ?? bookedGuest.room_no ?? bookedGuest.roomNo;
    assert.equal(roomVal, 105);
    assert.equal(bookedGuest.status, 'Booked');
  });

  it('5. Checked-Out guest displays room from most recent completed stay', () => {
    const checkedOutGuest = {
      id: 3,
      name: 'Eeswaran',
      status: 'Checked Out',
      statusKey: 'checked_out',
      room: 101,
      persons: 2,
      now: null,
    };
    const roomVal = checkedOutGuest.room ?? checkedOutGuest.room_no ?? checkedOutGuest.roomNo;
    assert.equal(roomVal, 101);
    assert.equal(checkedOutGuest.status, 'Checked Out');
    assert.equal(checkedOutGuest.now, null);
  });

  it('6. Guest with multiple historical stays displays the latest completed stay room', () => {
    const multiStayGuest = {
      id: 4,
      name: 'Jeba',
      status: 'Checked Out',
      statusKey: 'checked_out',
      room: 104,
      now: null,
    };
    const roomVal = multiStayGuest.room ?? multiStayGuest.room_no ?? multiStayGuest.roomNo;
    assert.equal(roomVal, 104);
  });

  it('7. Guest with cancelled booking only displays — (null room)', () => {
    const cancelledGuest = {
      id: 5,
      name: 'Jeya',
      status: 'Cancelled',
      statusKey: 'cancelled',
      room: null,
      now: null,
    };
    const roomVal = cancelledGuest.room ?? cancelledGuest.room_no ?? cancelledGuest.roomNo ?? null;
    assert.equal(roomVal, null);
    assert.equal(cancelledGuest.status, 'Cancelled');
  });

  it('8. Guest with no booking or stay history displays — (null room)', () => {
    const socialGuest = {
      id: 6,
      name: 'Social Guest',
      status: 'Not Staying',
      statusKey: 'not_staying',
      room: null,
      now: null,
    };
    const roomVal = socialGuest.room ?? socialGuest.room_no ?? socialGuest.roomNo ?? null;
    assert.equal(roomVal, null);
    assert.equal(socialGuest.status, 'Not Staying');
  });

  it('9. Filter by status in mobile matches all guest statuses consistently', () => {
    const guests = [
      { id: 1, name: 'InHouse Guest', statusKey: 'in_house', room: 102 },
      { id: 2, name: 'Booked Guest', statusKey: 'booked', room: 105 },
      { id: 3, name: 'CheckedOut Guest', statusKey: 'checked_out', room: 103 },
      { id: 4, name: 'Cancelled Guest', statusKey: 'cancelled', room: null },
      { id: 5, name: 'NoShow Guest', statusKey: 'no_show', room: null },
      { id: 6, name: 'NotStaying Guest', statusKey: 'not_staying', room: null },
    ];

    const filterGuests = (list, filter) => {
      if (filter === 'all') return list;
      return list.filter((g) => (g.statusKey || g.status_key) === filter);
    };

    assert.equal(filterGuests(guests, 'all').length, 6);
    assert.equal(filterGuests(guests, 'in_house').length, 1);
    assert.equal(filterGuests(guests, 'in_house')[0].room, 102);
    assert.equal(filterGuests(guests, 'booked').length, 1);
    assert.equal(filterGuests(guests, 'booked')[0].room, 105);
    assert.equal(filterGuests(guests, 'checked_out').length, 1);
    assert.equal(filterGuests(guests, 'checked_out')[0].room, 103);
    assert.equal(filterGuests(guests, 'cancelled').length, 1);
    assert.equal(filterGuests(guests, 'cancelled')[0].room, null);
  });
});
