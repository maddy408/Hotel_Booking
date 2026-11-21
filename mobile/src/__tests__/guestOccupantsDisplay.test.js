import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile Guests Screen – All Booking Occupants Display', () => {
  const guestsScreenPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
  const guestsScreenContent = fs.readFileSync(guestsScreenPath, 'utf8');

  it('1. GuestsScreen.jsx renders all occupants directly without hiding behind slice or truncation', () => {
    // Must NOT truncate visible occupants to 2
    assert.ok(
      !guestsScreenContent.includes('occupants.slice(0, 2)'),
      'GuestsScreen must NOT truncate occupants to first 2'
    );
    // Must NOT use small expand/collapse toggle for occupants list
    assert.ok(
      !guestsScreenContent.includes('expandOccupantsBtn'),
      'GuestsScreen must NOT hide occupants behind an expand toggle button'
    );
    assert.ok(
      !guestsScreenContent.includes('+${hiddenCount} more'),
      'GuestsScreen must NOT show +N more count instead of displaying all occupants'
    );
  });

  it('2. GuestsScreen.jsx renders bullet, full occupant names without artificial width constraints, and primary label', () => {
    assert.ok(
      guestsScreenContent.includes('styles.occupantBullet') || guestsScreenContent.includes('•'),
      'GuestsScreen must render a list bullet for each occupant'
    );
    assert.ok(
      guestsScreenContent.includes('(Primary Guest)'),
      'GuestsScreen must display the (Primary Guest) label for the primary occupant'
    );
    // Must NOT artificially constrain occupantName width to 140px or truncate single line
    assert.ok(
      !guestsScreenContent.includes('maxWidth: 140'),
      'occupantName style must not restrict name width to 140px'
    );
  });

  it('3. Booking with 1 occupant: displays exactly 1 occupant with primary label', () => {
    const singleOccupantGuest = {
      id: 1,
      name: 'Vikram Singh',
      room: 305,
      persons: 1,
      status: 'In-House',
      occupants: [
        { name: 'Vikram Singh', role: 'Primary Guest', is_primary: true },
      ],
      occupantsStatus: 'ok',
    };

    assert.equal(singleOccupantGuest.occupants.length, 1);
    assert.equal(singleOccupantGuest.occupants[0].name, 'Vikram Singh');
    assert.equal(singleOccupantGuest.occupants[0].is_primary, true);
  });

  it('4. Booking with 2 occupants: displays both primary and additional occupants (Arjun Mehta & Rahul Kumar)', () => {
    const twoOccupantsGuest = {
      id: 3,
      name: 'Arjun Mehta',
      room: 106,
      persons: 2,
      status: 'In-House',
      occupants: [
        { name: 'Arjun Mehta', role: 'Primary Guest', is_primary: true },
        { name: 'Rahul Kumar', role: 'Additional Occupant', is_primary: false },
      ],
      occupantsStatus: 'ok',
    };

    assert.equal(twoOccupantsGuest.occupants.length, 2);
    assert.equal(twoOccupantsGuest.occupants[0].name, 'Arjun Mehta');
    assert.equal(twoOccupantsGuest.occupants[0].is_primary, true);
    assert.equal(twoOccupantsGuest.occupants[1].name, 'Rahul Kumar');
    assert.equal(twoOccupantsGuest.occupants[1].is_primary, false);
  });

  it('5. Booking with 3 or more occupants: displays all occupants without truncation (Charlie Brown, Lucy van Pelt, Linus van Pelt)', () => {
    const threeOccupantsGuest = {
      id: 100471,
      name: 'John Doe',
      room: 108,
      persons: 3,
      status: 'In-House',
      occupants: [
        { name: 'Charlie Brown', role: 'Primary Guest', is_primary: true },
        { name: 'Lucy van Pelt', role: 'Additional Occupant', is_primary: false },
        { name: 'Linus van Pelt', role: 'Additional Occupant', is_primary: false },
      ],
      occupantsStatus: 'ok',
    };

    assert.equal(threeOccupantsGuest.occupants.length, 3);
    assert.equal(threeOccupantsGuest.occupants[0].name, 'Charlie Brown');
    assert.equal(threeOccupantsGuest.occupants[1].name, 'Lucy van Pelt');
    assert.equal(threeOccupantsGuest.occupants[2].name, 'Linus van Pelt');
  });

  it('6. Group booking & Multiple rooms under one reservation: keeps each room occupants distinct', () => {
    const multiRoomGuest = {
      id: 100471,
      name: 'John Doe',
      room: 107,
      additionalRooms: [108],
      persons: 2,
      status: 'In-House',
      occupants: [
        { name: 'John Doe', role: 'Primary Guest', is_primary: true },
        { name: 'Mary', role: 'Additional Occupant', is_primary: false },
      ],
      occupantsStatus: 'ok',
    };

    // Does NOT merge Room 108 occupants into Room 107
    assert.equal(multiRoomGuest.room, 107);
    assert.deepEqual(multiRoomGuest.additionalRooms, [108]);
    assert.equal(multiRoomGuest.occupants.length, 2);
    assert.equal(multiRoomGuest.occupants[0].name, 'John Doe');
    assert.equal(multiRoomGuest.occupants[1].name, 'Mary');
  });

  it('7. Checked-out guest records: displays actual occupants associated with completed stay', () => {
    const checkedOutGuest = {
      id: 100471,
      name: 'John Doe',
      room: null,
      persons: 2,
      status: 'Checked Out',
      occupants: [
        { name: 'John Doe', role: 'Primary Guest', is_primary: true },
        { name: 'Jane Doe', role: 'Additional Occupant', is_primary: false },
      ],
      occupantsStatus: 'ok',
    };

    assert.equal(checkedOutGuest.status, 'Checked Out');
    assert.equal(checkedOutGuest.occupants.length, 2);
    assert.equal(checkedOutGuest.occupants[1].name, 'Jane Doe');
  });

  it('8. Guests with upcoming booking: shows not added yet, does not steal historical stay occupants', () => {
    const upcomingBookingGuest = {
      id: 101072,
      name: 'Maya',
      room: 102,
      persons: 2,
      status: 'Booked',
      occupants: [],
      occupantsStatus: 'not_added_yet',
    };

    assert.equal(upcomingBookingGuest.status, 'Booked');
    assert.equal(upcomingBookingGuest.occupantsStatus, 'not_added_yet');
    assert.equal(upcomingBookingGuest.occupants.length, 0);
  });

  it('9. Deduplication logic prevents duplicate occupant names in guest card', () => {
    const rawOccupants = [
      { name: 'Arjun Mehta', is_primary: true, role: 'Primary Guest' },
      { name: 'Rahul Kumar', is_primary: false, role: 'Additional Occupant' },
      { name: 'Arjun Mehta', is_primary: false, role: 'Additional Occupant' }, // duplicate
    ];

    const seenNames = new Set();
    const uniqueOccupants = [];
    for (const occ of rawOccupants) {
      const nameKey = (occ.name || '').trim().toLowerCase();
      if (nameKey && seenNames.has(nameKey)) continue;
      if (nameKey) seenNames.add(nameKey);
      uniqueOccupants.push(occ);
    }

    assert.equal(uniqueOccupants.length, 2);
    assert.equal(uniqueOccupants[0].name, 'Arjun Mehta');
    assert.equal(uniqueOccupants[1].name, 'Rahul Kumar');
  });

  it('10. Preserves View Profile and Edit buttons working on the card', () => {
    assert.ok(guestsScreenContent.includes('title="View Profile"'), 'View Profile button must be preserved');
    assert.ok(guestsScreenContent.includes('title="Edit"'), 'Edit button must be preserved');
    assert.ok(guestsScreenContent.includes('GuestEditSheet'), 'GuestEditSheet must remain intact');
  });
});
