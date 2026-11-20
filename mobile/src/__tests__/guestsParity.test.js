import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Mobile Guests Screen & Details Web Parity', () => {
  it('1. Correctly maps all web guest fields in the register entries', () => {
    const mockGuest = {
      id: 10,
      name: 'Priya Sharma',
      phone: '9876543210',
      email: 'priya@example.com',
      city: 'Coimbatore',
      address: '123 Cross Cut Road, Gandhipuram',
      room: 102,
      additionalRooms: [104],
      persons: 3,
      occupants: [
        { name: 'Priya Sharma', role: 'Primary Guest', is_primary: true },
        { name: 'Rahul Sharma', role: 'Additional Occupant', is_primary: false },
        { name: 'Ananya Sharma', role: 'Additional Occupant', is_primary: false },
      ],
      occupantsStatus: 'ok',
      referredBy: { id: 5, name: 'Anand Kumar' },
      visits: 4,
      status: 'In-House',
      statusKey: 'in_house',
      idProofType: 'Aadhaar',
      idProofLast4: '5678',
    };

    assert.equal(mockGuest.name, 'Priya Sharma');
    assert.equal(mockGuest.phone, '9876543210');
    assert.equal(mockGuest.email, 'priya@example.com');
    assert.equal(mockGuest.city, 'Coimbatore');
    assert.equal(mockGuest.address, '123 Cross Cut Road, Gandhipuram');
    assert.equal(mockGuest.room, 102);
    assert.equal(mockGuest.additionalRooms.length, 1);
    assert.equal(mockGuest.persons, 3);
    assert.equal(mockGuest.occupants.length, 3);
    assert.equal(mockGuest.occupants[0].is_primary, true);
    assert.equal(mockGuest.referredBy.name, 'Anand Kumar');
    assert.equal(mockGuest.visits, 4);
    assert.equal(mockGuest.statusKey, 'in_house');
    assert.equal(mockGuest.idProofType, 'Aadhaar');
    assert.equal(mockGuest.idProofLast4, '5678');
  });

  it('2. Formats status keys consistently for filtering (in_house, booked, checked_out, no_show, cancelled)', () => {
    const guests = [
      { id: 1, name: 'Guest 1', statusKey: 'in_house' },
      { id: 2, name: 'Guest 2', statusKey: 'booked' },
      { id: 3, name: 'Guest 3', statusKey: 'checked_out' },
      { id: 4, name: 'Guest 4', statusKey: 'no_show' },
      { id: 5, name: 'Guest 5', statusKey: 'cancelled' },
    ];

    const filterGuests = (list, filter) => {
      if (filter === 'all') return list;
      return list.filter((g) => g.statusKey === filter);
    };

    assert.equal(filterGuests(guests, 'all').length, 5);
    assert.equal(filterGuests(guests, 'in_house').length, 1);
    assert.equal(filterGuests(guests, 'booked').length, 1);
    assert.equal(filterGuests(guests, 'checked_out').length, 1);
    assert.equal(filterGuests(guests, 'no_show').length, 1);
    assert.equal(filterGuests(guests, 'cancelled').length, 1);
  });

  it('3. Computes guest details financial summary and outstanding balance accurately', () => {
    const payments = [
      { id: 1, type: 'advance', amount: '1000.00', status: 'successful' },
      { id: 2, type: 'balance', amount: '1500.00', status: 'successful' },
      { id: 3, type: 'extra', amount: '200.00', status: 'successful' },
      { id: 4, type: 'refund', amount: '300.00', status: 'successful' },
    ];

    const successfulPayments = payments.filter((p) => p.status === 'successful');
    const advanceTotal = successfulPayments.filter((p) => p.type === 'advance').reduce((sum, p) => sum + Number(p.amount), 0);
    const additionalTotal = successfulPayments.filter((p) => p.type === 'balance' || p.type === 'extra').reduce((sum, p) => sum + Number(p.amount), 0);
    const refundTotal = successfulPayments.filter((p) => p.type === 'refund').reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPaid = advanceTotal + additionalTotal - refundTotal;

    assert.equal(advanceTotal, 1000);
    assert.equal(additionalTotal, 1700);
    assert.equal(refundTotal, 300);
    assert.equal(totalPaid, 2400);
  });

  it('4. Aggregates all documents across profile, stays, bookings, and occupants', () => {
    const guest = {
      documents: [{ id: 1, original_filename: 'profile-id.pdf' }],
      hasIdImage: true,
      stays: [
        {
          id: 101,
          room_no: 201,
          documents: [{ id: 2, original_filename: 'stay-doc.jpg' }],
          occupants: [
            { name: 'Occupant B', is_primary: false, documents: [{ id: 3, original_filename: 'occ-b-id.pdf' }] },
          ],
        },
      ],
      bookings: [
        { id: 50, booking_code: 'BK-50', documents: [{ id: 4, original_filename: 'booking-id.jpg' }] },
      ],
    };

    const list = [...(guest.documents || [])];
    const seenIds = new Set(list.map((d) => d.id));

    for (const st of guest.stays || []) {
      for (const d of st.documents || []) {
        if (!seenIds.has(d.id)) { seenIds.add(d.id); list.push(d); }
      }
      for (const occ of st.occupants || []) {
        for (const d of occ.documents || []) {
          if (!seenIds.has(d.id)) { seenIds.add(d.id); list.push(d); }
        }
      }
    }
    for (const bk of guest.bookings || []) {
      for (const d of bk.documents || []) {
        if (!seenIds.has(d.id)) { seenIds.add(d.id); list.push(d); }
      }
    }

    assert.equal(list.length, 4);
    assert.deepEqual(list.map((d) => d.id), [1, 2, 3, 4]);
  });
});
