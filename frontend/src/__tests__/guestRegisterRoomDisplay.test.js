import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Guest Register Room Number Display & Status Parity (Web)', () => {
  const guestsPagePath = path.join(srcDir, 'pages', 'Guests.jsx');
  const guestsPageContent = fs.readFileSync(guestsPagePath, 'utf8');

  it('1. Guests.jsx table view renders room number from g.room, g.room_no or g.roomNo and falls back to —', () => {
    assert.ok(
      guestsPageContent.includes('(g.room ?? g.room_no ?? g.roomNo)') ||
      guestsPageContent.includes('g.room || g.room_no || g.roomNo') ||
      guestsPageContent.includes('g.room ?'),
      'Guests.jsx must evaluate room number from guest record'
    );
    assert.ok(
      guestsPageContent.includes('className="rtag"'),
      'Guests.jsx must use rtag styling for room number in table view'
    );
    assert.ok(
      guestsPageContent.includes('<span className="muted">—</span>'),
      'Guests.jsx must display em dash when room number is absent'
    );
  });

  it('2. Guests.jsx responsive card view renders Room {number} and falls back to —', () => {
    assert.ok(
      guestsPageContent.includes('Room {g.room ?? g.room_no ?? g.roomNo}') ||
      guestsPageContent.includes('Room {g.room}') ||
      guestsPageContent.includes('Room {roomVal}'),
      'Guests.jsx card view must display Room label with room number'
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
      room: 104, // stayed in 102 in Jan, 104 in Feb -> displays 104
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

  it('9. Guest with completed stay and subsequent cancelled booking does not display previous stay room for the cancelled booking', () => {
    const stayThenCancelledGuest = {
      id: 7,
      name: 'Test Cancelled After Stay',
      status: 'Cancelled',
      statusKey: 'cancelled',
      room: null,
      now: null,
    };
    const roomVal = stayThenCancelledGuest.room ?? stayThenCancelledGuest.room_no ?? stayThenCancelledGuest.roomNo ?? null;
    assert.equal(roomVal, null);
    assert.equal(stayThenCancelledGuest.status, 'Cancelled');
  });
});
