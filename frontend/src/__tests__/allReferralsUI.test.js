import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('All Referrals Register UI & State Rules', () => {
  // Test 1: Summary Calculation from Database Records
  it('1. calculates referral summary accurately and distinguishes booking counts from unique guest counts', () => {
    const rawReferrals = [
      {
        reservation_id: 1,
        booking_code: 'BK-1001',
        referred_guest_id: 201,
        referred_guest_name: 'Ananya',
        has_arrived: true,
        status_code: 'in_house',
      },
      {
        reservation_id: 2,
        booking_code: 'BK-1002',
        referred_guest_id: 201, // Same guest as above!
        referred_guest_name: 'Ananya',
        has_arrived: false,
        status_code: 'upcoming',
      },
      {
        reservation_id: 3,
        booking_code: 'BK-1003',
        referred_guest_id: 202,
        referred_guest_name: 'Rohan',
        has_arrived: true,
        status_code: 'checked_out',
      },
      {
        reservation_id: 4,
        booking_code: 'BK-1004',
        referred_guest_id: 203,
        referred_guest_name: 'Priya',
        has_arrived: false,
        status_code: 'confirmed',
      },
    ];

    const calculateSummary = (items) => {
      const totalBookings = items.length;
      const uniqueGuests = new Set(items.map((i) => i.referred_guest_id)).size;
      const arrivedGuests = new Set(items.filter((i) => i.has_arrived).map((i) => i.referred_guest_id)).size;
      const upcomingBookings = items.filter(
        (i) => i.status_code === 'upcoming' || i.status_code === 'confirmed'
      ).length;

      return {
        total_referral_bookings: totalBookings,
        unique_referred_guests: uniqueGuests,
        arrived_referred_guests: arrivedGuests,
        upcoming_referral_bookings: upcomingBookings,
      };
    };

    const summary = calculateSummary(rawReferrals);

    // 4 total bookings
    assert.equal(summary.total_referral_bookings, 4);
    // 3 unique referred guests (201, 202, 203) - Ananya is not double counted!
    assert.equal(summary.unique_referred_guests, 3);
    // 2 unique guests arrived (201 and 202)
    assert.equal(summary.arrived_referred_guests, 2);
    // 2 upcoming bookings (BK-1002, BK-1004)
    assert.equal(summary.upcoming_referral_bookings, 2);
  });

  // Test 2: Formatting all 12 required fields in the Referral Register table
  it('2. formats all 12 required fields in the Referral Register table', () => {
    const item = {
      reservation_id: 501,
      booking_code: 'BK-2050',
      booking_date: '2026-11-17 10:15:00',
      scheduled_check_in: '2026-11-17',
      scheduled_check_out: '2026-11-19',
      room_no: 301,
      referrer_id: 27,
      referrer_name: 'Kalai',
      referrer_phone: '9840123456',
      referred_guest_id: 104718,
      referred_guest_name: 'Gayu',
      referred_guest_phone: '8364672819',
      status: 'In-House',
      status_code: 'in_house',
      has_arrived: true,
      actual_check_in: '2026-11-17 10:48:04',
      actual_check_out: null,
    };

    const formatRow = (r) => ({
      referrerName: r.referrer_name || '—',
      referrerMobile: r.referrer_phone || '—',
      referredGuestName: r.referred_guest_name || '—',
      referredGuestMobile: r.referred_guest_phone || '—',
      bookingId: r.booking_code || `#${r.reservation_id}`,
      bookingDate: r.booking_date ? r.booking_date.split(' ')[0] : '—',
      roomNumber: r.room_no ? `Room ${r.room_no}` : '—',
      scheduledCheckIn: r.scheduled_check_in || '—',
      scheduledCheckOut: r.scheduled_check_out || '—',
      actualCheckIn: r.actual_check_in || '—',
      actualCheckOut: r.actual_check_out || '—',
      status: r.status,
    });

    const formatted = formatRow(item);

    assert.equal(formatted.referrerName, 'Kalai');
    assert.equal(formatted.referrerMobile, '9840123456');
    assert.equal(formatted.referredGuestName, 'Gayu');
    assert.equal(formatted.referredGuestMobile, '8364672819');
    assert.equal(formatted.bookingId, 'BK-2050');
    assert.equal(formatted.bookingDate, '2026-11-17');
    assert.equal(formatted.roomNumber, 'Room 301');
    assert.equal(formatted.scheduledCheckIn, '2026-11-17');
    assert.equal(formatted.scheduledCheckOut, '2026-11-19');
    assert.equal(formatted.actualCheckIn, '2026-11-17 10:48:04');
    assert.equal(formatted.actualCheckOut, '—');
    assert.equal(formatted.status, 'In-House');
  });

  // Test 3: Arrival logic - Real check-in required, advance payment alone is not arrival
  it('3. enforces that arrival requires active or historical stay, and advance payment is not an arrival', () => {
    const deriveStatusAndArrival = ({ reservationStatus, stayStatus, advancePaid }) => {
      if (stayStatus === 'in_house') {
        return { status: 'In-House', hasArrived: true };
      }
      if (stayStatus === 'checked_out') {
        return { status: 'Checked Out', hasArrived: true };
      }
      if (reservationStatus === 'cancelled' || stayStatus === 'cancelled') {
        return { status: 'Cancelled', hasArrived: false };
      }
      if (reservationStatus === 'no_show') {
        return { status: 'No-Show', hasArrived: false };
      }
      // Pending check-in
      if (advancePaid > 0) {
        return { status: 'Confirmed', hasArrived: false };
      }
      return { status: 'Upcoming', hasArrived: false };
    };

    // Case 1: Advance paid but not checked in -> Confirmed, NOT arrived
    const advancePaidBooking = deriveStatusAndArrival({
      reservationStatus: 'pending',
      stayStatus: null,
      advancePaid: 500,
    });
    assert.equal(advancePaidBooking.status, 'Confirmed');
    assert.equal(advancePaidBooking.hasArrived, false);

    // Case 2: Checked in -> In-House, arrived
    const checkedInBooking = deriveStatusAndArrival({
      reservationStatus: 'checked_in',
      stayStatus: 'in_house',
      advancePaid: 500,
    });
    assert.equal(checkedInBooking.status, 'In-House');
    assert.equal(checkedInBooking.hasArrived, true);

    // Case 3: Checked out -> Checked Out, arrived
    const checkedOutBooking = deriveStatusAndArrival({
      reservationStatus: 'checked_in',
      stayStatus: 'checked_out',
      advancePaid: 500,
    });
    assert.equal(checkedOutBooking.status, 'Checked Out');
    assert.equal(checkedOutBooking.hasArrived, true);

    // Case 4: No-show -> No-Show, NOT arrived
    const noShowBooking = deriveStatusAndArrival({
      reservationStatus: 'no_show',
      stayStatus: null,
      advancePaid: 0,
    });
    assert.equal(noShowBooking.status, 'No-Show');
    assert.equal(noShowBooking.hasArrived, false);
  });

  // Test 4: Search filtering by referrer and referred guest name/phone
  it('4. filters referrals correctly by search query', () => {
    const records = [
      {
        reservation_id: 1,
        booking_code: 'BK-1001',
        referrer_name: 'Kalai',
        referrer_phone: '9840123456',
        referred_guest_name: 'Gayu',
        referred_guest_phone: '8364672819',
        room_no: 301,
      },
      {
        reservation_id: 2,
        booking_code: 'BK-1002',
        referrer_name: 'John Doe',
        referrer_phone: '9876543210',
        referred_guest_name: 'Kalai',
        referred_guest_phone: '9840123456',
        room_no: 102,
      },
      {
        reservation_id: 3,
        booking_code: 'BK-1003',
        referrer_name: 'Suresh',
        referrer_phone: '9110000000',
        referred_guest_name: 'Ananya',
        referred_guest_phone: '9220000000',
        room_no: 201,
      },
    ];

    const filterList = (list, query) => {
      if (!query.trim()) return list;
      const q = query.toLowerCase().trim();
      return list.filter(
        (it) =>
          it.referrer_name.toLowerCase().includes(q) ||
          it.referrer_phone.includes(q) ||
          it.referred_guest_name.toLowerCase().includes(q) ||
          it.referred_guest_phone.includes(q) ||
          it.booking_code.toLowerCase().includes(q) ||
          String(it.room_no).includes(q)
      );
    };

    // Search by referrer name "Kalai" -> matches BK-1001 (referrer) and BK-1002 (referred guest)
    assert.equal(filterList(records, 'Kalai').length, 2);

    // Search by referred guest phone "8364672819"
    const byPhone = filterList(records, '8364672819');
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0].booking_code, 'BK-1001');

    // Search by booking code "BK-1003"
    const byCode = filterList(records, 'BK-1003');
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].referred_guest_name, 'Ananya');
  });

  // Test 5: Click actions navigation targets
  it('5. triggers correct navigation targets for referrer, referred guest, and booking details', () => {
    const item = {
      reservation_id: 42,
      booking_code: 'BK-1042',
      referrer_id: 10,
      referred_guest_id: 25,
    };

    const getReferrerLink = (it) => `/guests/${it.referrer_id}`;
    const getReferredGuestLink = (it) => `/guests/${it.referred_guest_id}`;
    const getBookingSheetAction = (it) => ({ type: 'booking', id: it.reservation_id });

    assert.equal(getReferrerLink(item), '/guests/10');
    assert.equal(getReferredGuestLink(item), '/guests/25');
    assert.deepEqual(getBookingSheetAction(item), { type: 'booking', id: 42 });
  });

  // Test 6: Status filtering
  it('6. filters referrals by status accurately', () => {
    const records = [
      { id: 1, status_code: 'in_house', has_arrived: true },
      { id: 2, status_code: 'checked_out', has_arrived: true },
      { id: 3, status_code: 'upcoming', has_arrived: false },
      { id: 4, status_code: 'confirmed', has_arrived: false },
      { id: 5, status_code: 'cancelled', has_arrived: false },
    ];

    const filterByStatus = (list, filter) => {
      if (filter === 'all') return list;
      if (filter === 'arrived') return list.filter((i) => i.has_arrived);
      if (filter === 'upcoming') return list.filter((i) => i.status_code === 'upcoming' || i.status_code === 'confirmed');
      return list.filter((i) => i.status_code === filter);
    };

    assert.equal(filterByStatus(records, 'all').length, 5);
    assert.equal(filterByStatus(records, 'arrived').length, 2);
    assert.equal(filterByStatus(records, 'in_house').length, 1);
    assert.equal(filterByStatus(records, 'upcoming').length, 2);
    assert.equal(filterByStatus(records, 'cancelled').length, 1);
  });
});
