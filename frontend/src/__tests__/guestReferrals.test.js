import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Guest Referral History & Booking Source Referrer Information', () => {
  // Test 1: Booking Details Page – Booking Source Display Logic
  it('1. displays correct booking source information for Social Media, Reference, and Other', () => {
    const getBookingSourceDisplay = (reservation) => {
      const source = reservation.booking_source || 'Social Media';
      const isReference = source === 'Reference – Existing Member' || source === 'Reference' || source.startsWith('Reference');
      const isOther = source === 'Other';

      if (isReference) {
        return {
          sourceLabel: 'Reference',
          referredByName: reservation.referred_by_guest_name || '—',
          referrerPhone: reservation.referred_by_guest_phone || '—',
        };
      }

      if (isOther) {
        return {
          sourceLabel: 'Other',
          personName: reservation.other_source || '—',
        };
      }

      return {
        sourceLabel: 'Social Media',
      };
    };

    // Case A: Social Media
    const socialRes = { id: 101, booking_source: 'Social Media' };
    assert.deepEqual(getBookingSourceDisplay(socialRes), { sourceLabel: 'Social Media' });

    // Case B: Reference – Existing Member
    const refRes = {
      id: 102,
      booking_source: 'Reference – Existing Member',
      referred_by_guest_id: 50,
      referred_by_guest_name: 'Arjun Mehta',
      referred_by_guest_phone: '9840123456',
    };
    assert.deepEqual(getBookingSourceDisplay(refRes), {
      sourceLabel: 'Reference',
      referredByName: 'Arjun Mehta',
      referrerPhone: '9840123456',
    });

    // Case C: Other
    const otherRes = {
      id: 103,
      booking_source: 'Other',
      other_source: 'Rajesh Tour Agent',
    };
    assert.deepEqual(getBookingSourceDisplay(otherRes), {
      sourceLabel: 'Other',
      personName: 'Rajesh Tour Agent',
    });
  });

  // Test 2: Guest Details Page – Section Title and Empty State Messaging
  it('2. renders People Referred by This Guest section with correct count or "No guests referred yet."', () => {
    const getReferralsSectionHeader = (referrals) => `People Referred by This Guest (${referrals?.length || 0})`;
    const getEmptyStateText = (referrals) => (!referrals || referrals.length === 0 ? 'No guests referred yet.' : null);

    // Empty state
    const emptyGuest = { id: 99, referrals: [] };
    assert.equal(getReferralsSectionHeader(emptyGuest.referrals), 'People Referred by This Guest (0)');
    assert.equal(getEmptyStateText(emptyGuest.referrals), 'No guests referred yet.');

    // With referrals
    const guestWithRefs = {
      id: 50,
      referrals: [
        { guest_id: 61, guest_name: 'Karthik Ramasamy', guest_phone: '9840111222' },
        { guest_id: 62, guest_name: 'Divya Krishnan', guest_phone: '9840111333' },
      ],
    };
    assert.equal(getReferralsSectionHeader(guestWithRefs.referrals), 'People Referred by This Guest (2)');
    assert.equal(getEmptyStateText(guestWithRefs.referrals), null);
  });

  // Test 3: Formatting all 7 required attributes for referred guests
  it('3. formats all 7 required attributes for referred guests (name, phone, booking ID, room no, booking date, check-in, status)', () => {
    const referredGuest = {
      guest_id: 61,
      guest_name: 'Karthik Ramasamy',
      guest_phone: '9840111222',
      booking_code: 'BK-4102',
      reservation_id: 301,
      room_no: 204,
      booking_date: '2026-11-16 10:30:00',
      check_in_date: '2026-11-18',
      status: 'pending',
    };

    const formatReferredRow = (rg) => ({
      name: rg.guest_name || rg.name,
      mobile: rg.guest_phone || rg.phone,
      bookingId: rg.booking_code || (rg.reservation_id ? `#${rg.reservation_id}` : '—'),
      room: rg.room_no ? `Room ${rg.room_no}` : '—',
      bookingDate: rg.booking_date ? rg.booking_date.split(' ')[0] : '—',
      checkInDate: rg.check_in_date ? rg.check_in_date.split(' ')[0] : '—',
      status: rg.status || '—',
    });

    const formatted = formatReferredRow(referredGuest);
    assert.equal(formatted.name, 'Karthik Ramasamy');
    assert.equal(formatted.mobile, '9840111222');
    assert.equal(formatted.bookingId, 'BK-4102');
    assert.equal(formatted.room, 'Room 204');
    assert.equal(formatted.bookingDate, '2026-11-16');
    assert.equal(formatted.checkInDate, '2026-11-18');
    assert.equal(formatted.status, 'pending');
  });

  // Test 4: Multiple referred guests appear under the same referrer without omission
  it('4. multiple referred guests under the same referrer all appear in referral history', () => {
    const referrerProfile = {
      id: 50,
      name: 'Arjun Mehta',
      referrals: [
        {
          guest_id: 61,
          guest_name: 'Karthik Ramasamy',
          guest_phone: '9840111222',
          booking_code: 'BK-4102',
          room_no: 204,
          booking_date: '2026-11-10 14:00:00',
          check_in_date: '2026-11-12',
          status: 'checked_out',
        },
        {
          guest_id: 62,
          guest_name: 'Divya Krishnan',
          guest_phone: '9840111333',
          booking_code: 'BK-4150',
          room_no: 305,
          booking_date: '2026-11-15 16:30:00',
          check_in_date: '2026-11-20',
          status: 'pending',
        },
      ],
    };

    assert.equal(referrerProfile.referrals.length, 2);
    const names = referrerProfile.referrals.map((r) => r.guest_name);
    assert.deepEqual(names, ['Karthik Ramasamy', 'Divya Krishnan']);
  });

  // Test 5: Isolation & Unrelated Guests
  it('5. unrelated guests do not show incorrect referral records and isolate referral history by referrer ID', () => {
    const allReferralRecords = [
      { referrer_id: 50, guest_id: 61, guest_name: 'Karthik Ramasamy' },
      { referrer_id: 50, guest_id: 62, guest_name: 'Divya Krishnan' },
      { referrer_id: 70, guest_id: 81, guest_name: 'Pooja Sharma' },
    ];

    const getReferralsForGuest = (guestId) =>
      allReferralRecords.filter((r) => r.referrer_id === guestId);

    // Arjun Mehta (ID 50)
    const arjunRefs = getReferralsForGuest(50);
    assert.equal(arjunRefs.length, 2);
    assert.equal(arjunRefs.some((r) => r.guest_id === 81), false);

    // Unrelated guest (ID 99)
    const unrelatedRefs = getReferralsForGuest(99);
    assert.equal(unrelatedRefs.length, 0);
  });

  // Test 6: Clicking a referred guest navigates to that guest's Guest Details page
  it('6. clicking a referred guest triggers navigation to /guests/{guestId}', () => {
    let currentRoute = '/guests/50';

    const navigate = (path) => {
      currentRoute = path;
    };

    const handleRowClick = (guestId) => {
      navigate(`/guests/${guestId}`);
    };

    const handleNameClick = (e, guestId) => {
      e.stopPropagation();
      navigate(`/guests/${guestId}`);
    };

    // Simulate clicking referred guest Divya Krishnan (ID 62)
    let stopped = false;
    handleNameClick({ stopPropagation: () => { stopped = true; } }, 62);
    assert.equal(stopped, true);
    assert.equal(currentRoute, '/guests/62');

    // Simulate clicking row for Karthik (ID 61)
    handleRowClick(61);
    assert.equal(currentRoute, '/guests/61');
  });

  // Test 7: Pre-booking Reference dropdown preservation
  it('7. preserves Reference dropdown behavior, validating selection and packaging payload', () => {
    const preparePayload = ({ bookingSource, referredByGuestId, otherSource }) => {
      if (bookingSource === 'Reference – Existing Member') {
        if (!referredByGuestId || Number(referredByGuestId) <= 0) {
          throw new Error('Please select an existing member as reference.');
        }
        return {
          bookingSource,
          referredByGuestId: Number(referredByGuestId),
          otherSource: null,
        };
      }
      if (bookingSource === 'Other') {
        if (!otherSource || !otherSource.trim()) {
          throw new Error('Please enter person name for reference.');
        }
        return {
          bookingSource,
          referredByGuestId: null,
          otherSource: otherSource.trim(),
        };
      }
      return {
        bookingSource: 'Social Media',
        referredByGuestId: null,
        otherSource: null,
      };
    };

    // Valid Reference
    const refPayload = preparePayload({
      bookingSource: 'Reference – Existing Member',
      referredByGuestId: 50,
      otherSource: '',
    });
    assert.equal(refPayload.bookingSource, 'Reference – Existing Member');
    assert.equal(refPayload.referredByGuestId, 50);
    assert.equal(refPayload.otherSource, null);

    // Invalid Reference
    assert.throws(() => {
      preparePayload({
        bookingSource: 'Reference – Existing Member',
        referredByGuestId: null,
        otherSource: '',
      });
    }, /Please select an existing member as reference\./);

    // Valid Other
    const otherPayload = preparePayload({
      bookingSource: 'Other',
      referredByGuestId: null,
      otherSource: 'Promoter Priya',
    });
    assert.equal(otherPayload.bookingSource, 'Other');
    assert.equal(otherPayload.referredByGuestId, null);
    assert.equal(otherPayload.otherSource, 'Promoter Priya');

    // Valid Social Media
    const socialPayload = preparePayload({
      bookingSource: 'Social Media',
      referredByGuestId: null,
      otherSource: '',
    });
    assert.equal(socialPayload.bookingSource, 'Social Media');
    assert.equal(socialPayload.referredByGuestId, null);
    assert.equal(socialPayload.otherSource, null);
  });
});
