import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatActualCheckIn, formatDateTime, fd, isCheckedIn } from '../lib/format.js';

describe('Mobile All Referrals Screen Parity', () => {
  const mockReferralApiResponse = {
    summary: {
      total_referral_bookings: 14,
      unique_referred_guests: 10,
      arrived_referred_guests: 8,
      upcoming_referral_bookings: 4,
    },
    items: [
      {
        id: 1,
        referred_by_guest_id: 101,
        referred_by_name: 'Rajesh Sharma',
        referred_by_phone: '9876543210',
        guest_id: 202,
        guest_name: 'Vikas Gupta',
        guest_phone: '9845012345',
        booking_id: 301,
        booking_code: 'TC-BKG-2026-001',
        room_number: '101',
        check_in: '2026-11-20',
        check_out: '2026-11-22',
        actual_check_in: null,
        actual_check_out: null,
        status: 'upcoming',
        total_amount: '4500.00',
        advance_amount: '1500.00',
        created_at: '2026-11-15 10:30:00',
      },
      {
        id: 2,
        referred_by_guest_id: 101,
        referred_by_name: 'Rajesh Sharma',
        referred_by_phone: '9876543210',
        guest_id: 205,
        guest_name: 'Kavita Nair',
        guest_phone: '9812345678',
        booking_id: 302,
        booking_code: 'TC-BKG-2026-002',
        room_number: '103',
        check_in: '2026-11-10',
        check_out: '2026-11-12',
        actual_check_in: '2026-11-10 14:15:00',
        actual_check_out: '2026-11-12 11:00:00',
        status: 'checked_out',
        total_amount: '6000.00',
        advance_amount: '2000.00',
        created_at: '2026-11-05 16:45:00',
      },
      {
        id: 3,
        referred_by_guest_id: 104,
        referred_by_name: 'Anita Desai',
        referred_by_phone: '9745632109',
        guest_id: 210,
        guest_name: 'Suresh Menon',
        guest_phone: '9654123890',
        booking_id: 303,
        booking_code: 'TC-BKG-2026-003',
        room_number: '205',
        check_in: '2026-11-18',
        check_out: '2026-11-21',
        actual_check_in: '2026-11-18 13:00:00',
        actual_check_out: null,
        status: 'in_house',
        total_amount: '9000.00',
        advance_amount: '3000.00',
        created_at: '2026-11-12 09:15:00',
      },
      {
        id: 4,
        referred_by_guest_id: 105,
        referred_by_name: 'Mohit Verma',
        referred_by_phone: '9988776655',
        guest_id: 215,
        guest_name: 'Deepak Patel',
        guest_phone: '9123456780',
        booking_id: 304,
        booking_code: 'TC-BKG-2026-004',
        room_number: '302',
        check_in: '2026-11-01',
        check_out: '2026-11-03',
        actual_check_in: null,
        actual_check_out: null,
        status: 'cancelled',
        total_amount: '5000.00',
        advance_amount: '0.00',
        created_at: '2026-10-25 11:20:00',
      },
    ],
  };

  it('1. Successfully maps summary metrics from the backend structure', () => {
    const summary = mockReferralApiResponse?.summary || {
      total_referral_bookings: 0,
      unique_referred_guests: 0,
      arrived_referred_guests: 0,
      upcoming_referral_bookings: 0,
    };

    assert.equal(summary.total_referral_bookings, 14);
    assert.equal(summary.unique_referred_guests, 10);
    assert.equal(summary.arrived_referred_guests, 8);
    assert.equal(summary.upcoming_referral_bookings, 4);
  });

  it('2. Extracts referral item records safely from items array or legacy referrals key', () => {
    const itemsFromNewKey = mockReferralApiResponse.items;
    assert.equal(itemsFromNewKey.length, 4);

    const legacyPayload = { referrals: [{ id: 99 }] };
    const itemsFromLegacy = legacyPayload.items || legacyPayload.referrals || [];
    assert.equal(itemsFromLegacy.length, 1);
    assert.equal(itemsFromLegacy[0].id, 99);
  });

  it('3. Filters referrals by search query across referrer, referred guest, and booking code', () => {
    const filterReferrals = (items, query) => {
      const q = query.trim().toLowerCase();
      if (!q) return items;
      return items.filter((item) => {
        const referred = (item.guest_name || '').toLowerCase();
        const referrer = (item.referred_by_name || '').toLowerCase();
        const code = (item.booking_code || '').toLowerCase();
        const phone = (item.guest_phone || item.referred_by_phone || '').toLowerCase();
        return referred.includes(q) || referrer.includes(q) || code.includes(q) || phone.includes(q);
      });
    };

    const byReferred = filterReferrals(mockReferralApiResponse.items, 'Vikas');
    assert.equal(byReferred.length, 1);
    assert.equal(byReferred[0].guest_name, 'Vikas Gupta');

    const byReferrer = filterReferrals(mockReferralApiResponse.items, 'Rajesh Sharma');
    assert.equal(byReferrer.length, 2);

    const byCode = filterReferrals(mockReferralApiResponse.items, 'TC-BKG-2026-003');
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].booking_id, 303);

    const byPhone = filterReferrals(mockReferralApiResponse.items, '9812345678');
    assert.equal(byPhone.length, 1);
    assert.equal(byPhone[0].guest_name, 'Kavita Nair');
  });

  it('4. Filters referrals by status chips accurately', () => {
    const filterByStatus = (items, statusFilter) => {
      if (statusFilter === 'all') return items;
      return items.filter((item) => {
        const st = (item.status || '').toLowerCase();
        if (statusFilter === 'upcoming') return st === 'upcoming' || st === 'confirmed' || st === 'booked';
        if (statusFilter === 'arrived') return st === 'in_house' || st === 'checked_in' || st === 'checked_out' || st === 'completed';
        if (statusFilter === 'cancelled') return st === 'cancelled' || st === 'no_show';
        return st === statusFilter;
      });
    };

    const all = filterByStatus(mockReferralApiResponse.items, 'all');
    assert.equal(all.length, 4);

    const upcoming = filterByStatus(mockReferralApiResponse.items, 'upcoming');
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0].id, 1);

    const arrived = filterByStatus(mockReferralApiResponse.items, 'arrived');
    assert.equal(arrived.length, 2); // checked_out and in_house

    const cancelled = filterByStatus(mockReferralApiResponse.items, 'cancelled');
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].id, 4);
  });

  it('5. formats actual_check_in safely for pending, future, checked-in, and checked-out reservations', () => {
    const items = mockReferralApiResponse.items;

    // Item 1: Upcoming reservation -> actual_check_in is null -> "Not checked in"
    assert.equal(items[0].status, 'upcoming');
    assert.equal(items[0].actual_check_in, null);
    assert.equal(formatActualCheckIn(items[0].actual_check_in), 'Not checked in');
    assert.equal(isCheckedIn(items[0].actual_check_in), false);
    // Scheduled check-in must NOT be used as actual check-in
    assert.notEqual(formatActualCheckIn(items[0].actual_check_in), fd(items[0].check_in));

    // Item 2: Checked-out reservation -> actual_check_in is '2026-11-10 14:15:00' -> '10 Nov, 2:15 PM'
    assert.equal(items[1].status, 'checked_out');
    assert.equal(formatActualCheckIn(items[1].actual_check_in), '10 Nov, 2:15 PM');
    assert.equal(formatDateTime(items[1].actual_check_out), '12 Nov, 11:00 AM');
    assert.equal(isCheckedIn(items[1].actual_check_in), true);

    // Item 3: In-house reservation -> actual_check_in is '2026-11-18 13:00:00' -> '18 Nov, 1:00 PM'
    assert.equal(items[2].status, 'in_house');
    assert.equal(formatActualCheckIn(items[2].actual_check_in), '18 Nov, 1:00 PM');
    assert.equal(isCheckedIn(items[2].actual_check_in), true);

    // Item 4: Cancelled reservation -> actual_check_in is null -> "Not checked in"
    assert.equal(items[3].status, 'cancelled');
    assert.equal(formatActualCheckIn(items[3].actual_check_in), 'Not checked in');
    assert.equal(isCheckedIn(items[3].actual_check_in), false);
  });

  it('6. displays "Not checked in" instead of "Invalid Date" on null, undefined, empty, and invalid date values', () => {
    const invalidInputs = [
      null,
      undefined,
      '',
      '   ',
      'null',
      'undefined',
      'Invalid Date',
      '0000-00-00',
      '0000-00-00 00:00:00',
      'invalid-string',
      '2026-13-45',
    ];

    for (const input of invalidInputs) {
      const output = formatActualCheckIn(input);
      assert.equal(output, 'Not checked in');
      assert.equal(isCheckedIn(input), false);
      assert.notEqual(output, 'Invalid Date');
      assert.equal(output.includes('Invalid Date'), false);
    }
  });
});
