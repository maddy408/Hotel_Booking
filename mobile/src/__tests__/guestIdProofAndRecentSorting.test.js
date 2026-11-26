import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Guest ID Proof Display & Recent-First Sorting Verification', () => {
  // Helper matching GuestsScreen filteredGuests sorting logic
  const sortGuests = (guests, filter = 'all', query = '') => {
    const list = (guests || []).filter((g) => {
      if (filter !== 'all') {
        const key = g.statusKey || g.status_key || (g.status || '').toLowerCase().replace(/[\s-]/g, '_');
        if (key !== filter) return false;
      }
      if (query.trim()) {
        const term = query.toLowerCase().trim();
        const matches =
          (g.name && g.name.toLowerCase().includes(term)) ||
          (g.phone && g.phone.includes(term)) ||
          (g.room && String(g.room).includes(term)) ||
          (g.email && g.email.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const dateA = a.created_at || a.createdAt || '';
      const dateB = b.created_at || b.createdAt || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  };

  // Helper matching BookingsScreen filteredReservations sorting logic
  const sortReservations = (reservations, query = '') => {
    const sorted = [...(reservations || [])].sort((a, b) => {
      const dateA = a.created_at || a.createdAt || '';
      const dateB = b.created_at || b.createdAt || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    if (!query.trim()) return sorted;
    const q = query.toLowerCase().trim();
    return sorted.filter((s) => (
      (s.booking_code && s.booking_code.toLowerCase().includes(q)) ||
      (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
      (s.guest_phone && s.guest_phone.includes(q)) ||
      (s.room_no && String(s.room_no).includes(q))
    ));
  };

  // Helper matching ID proof display in GuestsScreen / GuestDetailsScreen
  const getGuestIdProofDisplay = (guest) => {
    const idProofType = guest.idProofType || guest.id_proof_type;
    const idProofLast4 = guest.idProofLast4 || guest.id_proof_last4;
    if (!idProofType) {
      return 'Not Provided';
    }
    return `🪪 ${idProofType}${idProofLast4 ? ` (••••${idProofLast4})` : ''}`;
  };

  it('1. Displays "Not Provided" when guest has no ID proof saved', () => {
    const guestWithoutId = {
      id: 101,
      name: 'Walk-in Guest',
      phone: '9876543210',
      idProofType: null,
      id_proof_type: null,
      idProofLast4: null,
      id_proof_last4: null,
    };

    assert.equal(getGuestIdProofDisplay(guestWithoutId), 'Not Provided');
  });

  it('2. Displays actual ID proof type and masked number when ID proof is provided and saved', () => {
    const guestWithAadhaar = {
      id: 102,
      name: 'Ramya',
      phone: '6789799996',
      idProofType: 'Aadhaar',
      idProofLast4: '3772',
    };

    const guestWithPassport = {
      id: 103,
      name: 'Foreign Traveler',
      phone: '9123456789',
      idProofType: 'Passport',
      idProofLast4: '9876',
    };

    assert.equal(getGuestIdProofDisplay(guestWithAadhaar), '🪪 Aadhaar (••••3772)');
    assert.equal(getGuestIdProofDisplay(guestWithPassport), '🪪 Passport (••••9876)');
  });

  it('3. Does NOT confuse document uploads with ID proof type', () => {
    const guestWithDocOnly = {
      id: 104,
      name: 'Kalai',
      phone: '8545979946',
      idProofType: null,
      id_proof_type: null,
      idProofLast4: null,
      hasIdImage: true,
      id_image_path: 'guests/104-document.pdf',
      documents: [{ id: 1, original_filename: 'kalai_id.pdf' }],
    };

    assert.equal(getGuestIdProofDisplay(guestWithDocOnly), 'Not Provided');
    assert.ok(guestWithDocOnly.hasIdImage, 'Document upload is intact');
  });

  it('4. Sorts guests by latest registration first (created_at DESC, id DESC)', () => {
    const guests = [
      { id: 1, name: 'First Guest (Oldest)', created_at: '2026-11-20 10:00:00', statusKey: 'checked_out' },
      { id: 2, name: 'Second Guest', created_at: '2026-11-22 14:30:00', statusKey: 'checked_out' },
      { id: 3, name: 'Third Guest', created_at: '2026-11-25 09:00:00', statusKey: 'in_house' },
      { id: 5, name: 'Fifth Guest (Newest Secondary)', created_at: '2026-11-26 09:30:00', statusKey: 'booked' },
      { id: 4, name: 'Fourth Guest (Same Date, Lower ID)', created_at: '2026-11-26 09:30:00', statusKey: 'in_house' },
    ];

    const sorted = sortGuests(guests);

    // Newest created_at must appear at index 0; tie broken by id DESC
    assert.equal(sorted[0].id, 5, 'Guest #5 must be first (newest timestamp, highest ID)');
    assert.equal(sorted[1].id, 4, 'Guest #4 must be second (same timestamp, lower ID)');
    assert.equal(sorted[2].id, 3, 'Guest #3 must be third');
    assert.equal(sorted[3].id, 2, 'Guest #2 must be fourth');
    assert.equal(sorted[4].id, 1, 'Guest #1 must be last (oldest registration)');
  });

  it('5. Maintains recent-first guest sorting across status filtering and searching', () => {
    const guests = [
      { id: 10, name: 'Arun In-House Old', room: '101', phone: '9876500001', created_at: '2026-11-24 10:00:00', statusKey: 'in_house' },
      { id: 20, name: 'Bala In-House New', room: '102', phone: '9876500002', created_at: '2026-11-26 08:00:00', statusKey: 'in_house' },
      { id: 30, name: 'Charan Booked Newest', room: '103', phone: '9876500003', created_at: '2026-11-26 09:15:00', statusKey: 'booked' },
    ];

    // Filter in_house
    const inHouse = sortGuests(guests, 'in_house');
    assert.equal(inHouse.length, 2);
    assert.equal(inHouse[0].id, 20, 'Bala (newer in-house) must precede Arun (older in-house)');
    assert.equal(inHouse[1].id, 10);

    // Search by room
    const searched = sortGuests(guests, 'all', '10');
    assert.equal(searched.length, 3);
    assert.equal(searched[0].id, 30, 'Charan (newest) must be at the top of search results');
  });

  it('6. Sorts bookings by most recently created booking first (created_at DESC, id DESC)', () => {
    const bookings = [
      { id: 100, booking_code: 'BK-100', room_no: 305, guest_name: 'Zack (Room 305)', created_at: '2026-11-24 10:00:00', check_in_date: '2026-11-26' },
      { id: 101, booking_code: 'BK-101', room_no: 101, guest_name: 'Alice (Room 101)', created_at: '2026-11-25 12:00:00', check_in_date: '2026-11-27' },
      { id: 102, booking_code: 'BK-102', room_no: 202, guest_name: 'Bob (Room 202)', created_at: '2026-11-26 09:00:00', check_in_date: '2026-11-26' },
      { id: 104, booking_code: 'BK-104', room_no: 105, guest_name: 'David (Newest High ID)', created_at: '2026-11-26 09:30:00', check_in_date: '2026-11-28' },
      { id: 103, booking_code: 'BK-103', room_no: 102, guest_name: 'Charlie (Same time, lower ID)', created_at: '2026-11-26 09:30:00', check_in_date: '2026-11-26' },
    ];

    const sorted = sortReservations(bookings);

    // Most recently created booking must appear first
    assert.equal(sorted[0].id, 104, 'Booking BK-104 must be first (newest created_at, highest ID)');
    assert.equal(sorted[1].id, 103, 'Booking BK-103 must be second (same created_at, lower ID)');
    assert.equal(sorted[2].id, 102, 'Booking BK-102 must be third');
    assert.equal(sorted[3].id, 101, 'Booking BK-101 must be fourth');
    assert.equal(sorted[4].id, 100, 'Booking BK-100 must be last (oldest creation)');

    // Ensure it does NOT sort by guest name (Alice) or room number (101) first
    assert.notEqual(sorted[0].guest_name, 'Alice (Room 101)', 'Must not sort alphabetically by guest name');
    assert.notEqual(sorted[0].room_no, 101, 'Must not sort by room number');
  });

  it('7. Preserves recent-first booking order within date sections', () => {
    const today = '2026-11-26';
    const tomorrow = '2026-11-27';
    const bookings = [
      { id: 201, booking_code: 'BK-201', guest_name: 'Morning Booking', room_no: 201, check_in_date: today, created_at: '2026-11-26 08:00:00', status: 'pending' },
      { id: 202, booking_code: 'BK-202', guest_name: 'Noon Booking', room_no: 101, check_in_date: today, created_at: '2026-11-26 12:00:00', status: 'pending' },
      { id: 203, booking_code: 'BK-203', guest_name: 'Latest Booking', room_no: 301, check_in_date: today, created_at: '2026-11-26 15:30:00', status: 'pending' },
    ];

    const sorted = sortReservations(bookings);
    const todayGroup = sorted.filter((s) => s.check_in_date === today);

    assert.equal(todayGroup[0].id, 203, 'BK-203 (latest created) must be at the top of Today section');
    assert.equal(todayGroup[1].id, 202, 'BK-202 must be second');
    assert.equal(todayGroup[2].id, 201, 'BK-201 (earliest created) must be third');
  });
});
