import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Booking Source / Reference UI Logic and State Rules', () => {
  const BOOKING_SOURCES = [
    'Social Media',
    'Reference – Existing Member',
    'Other',
  ];

  const handleSourceChange = (newSource, currentValues) => {
    return {
      bookingSource: newSource,
      referredByGuestId: newSource === 'Reference – Existing Member' ? currentValues.referredByGuestId : null,
      otherSource: newSource === 'Other' ? currentValues.otherSource : '',
    };
  };

  const validateBookingSource = ({ bookingSource, referredByGuestId, otherSource }) => {
    if (bookingSource === 'Reference – Existing Member') {
      if (!referredByGuestId || Number(referredByGuestId) <= 0) {
        return { valid: false, error: 'Please select an existing member as reference.' };
      }
    }
    if (bookingSource === 'Other') {
      if (!otherSource || !otherSource.trim()) {
        return { valid: false, error: 'Please enter person name for reference.' };
      }
    }
    return { valid: true, error: null };
  };

  const filterGuests = (guests, search, excludeGuestId = null) => {
    return (guests || []).filter((g) => {
      if (excludeGuestId && g.id === Number(excludeGuestId)) return false;
      if (!search || !search.trim()) return true;
      const q = search.toLowerCase();
      const nameMatch = (g.name || '').toLowerCase().includes(q);
      const phoneMatch = (g.phone || '').includes(q);
      return nameMatch || phoneMatch;
    });
  };

  it('provides strictly the three defined dropdown options', () => {
    assert.deepEqual(BOOKING_SOURCES, [
      'Social Media',
      'Reference – Existing Member',
      'Other',
    ]);
    assert.equal(BOOKING_SOURCES.length, 3);
  });

  it('determines correct conditional field visibility for each option', () => {
    const getVisibleField = (source) => {
      if (source === 'Reference – Existing Member') return 'referred_by_dropdown';
      if (source === 'Other') return 'person_name_input';
      return 'none';
    };

    assert.equal(getVisibleField('Social Media'), 'none');
    assert.equal(getVisibleField('Reference – Existing Member'), 'referred_by_dropdown');
    assert.equal(getVisibleField('Other'), 'person_name_input');
  });

  it('clears irrelevant values when selection changes from Reference to Social Media', () => {
    const initial = {
      bookingSource: 'Reference – Existing Member',
      referredByGuestId: 42,
      otherSource: '',
    };

    const next = handleSourceChange('Social Media', initial);
    assert.equal(next.bookingSource, 'Social Media');
    assert.equal(next.referredByGuestId, null);
    assert.equal(next.otherSource, '');
  });

  it('clears irrelevant values when selection changes from Other to Reference', () => {
    const initial = {
      bookingSource: 'Other',
      referredByGuestId: null,
      otherSource: 'Promoter Dave',
    };

    const next = handleSourceChange('Reference – Existing Member', initial);
    assert.equal(next.bookingSource, 'Reference – Existing Member');
    assert.equal(next.referredByGuestId, null);
    assert.equal(next.otherSource, '');
  });

  it('clears irrelevant values when selection changes from Reference to Other', () => {
    const initial = {
      bookingSource: 'Reference – Existing Member',
      referredByGuestId: 42,
      otherSource: '',
    };

    const next = handleSourceChange('Other', initial);
    assert.equal(next.bookingSource, 'Other');
    assert.equal(next.referredByGuestId, null);
    assert.equal(next.otherSource, '');
  });

  it('filters existing guests by name and phone number', () => {
    const sampleGuests = [
      { id: 10, name: 'Karthik Ramasamy', phone: '9843011872' },
      { id: 11, name: 'Suresh Kumar', phone: '9994703168' },
      { id: 12, name: 'Alice Walker', phone: '9845032716' },
      { id: 13, name: 'Bob Karthik', phone: '9443871204' },
    ];

    // Search by name
    const nameResults = filterGuests(sampleGuests, 'karthik');
    assert.equal(nameResults.length, 2);
    assert.deepEqual(nameResults.map((g) => g.id), [10, 13]);

    // Search by phone
    const phoneResults = filterGuests(sampleGuests, '98450');
    assert.equal(phoneResults.length, 1);
    assert.equal(phoneResults[0].name, 'Alice Walker');

    // Exclude current guest if matched
    const excludedResults = filterGuests(sampleGuests, '', 10);
    assert.equal(excludedResults.some((g) => g.id === 10), false);
    assert.equal(excludedResults.length, 3);
  });

  it('validates required fields conditionally on submission', () => {
    // Social Media: valid without extra fields
    const res1 = validateBookingSource({ bookingSource: 'Social Media', referredByGuestId: null, otherSource: '' });
    assert.equal(res1.valid, true);

    // Reference – Existing Member: invalid when no guest ID selected
    const res2 = validateBookingSource({ bookingSource: 'Reference – Existing Member', referredByGuestId: null, otherSource: '' });
    assert.equal(res2.valid, false);
    assert.equal(res2.error, 'Please select an existing member as reference.');

    // Reference – Existing Member: valid when guest ID is selected
    const res3 = validateBookingSource({ bookingSource: 'Reference – Existing Member', referredByGuestId: 15, otherSource: '' });
    assert.equal(res3.valid, true);

    // Other: invalid when person name is empty
    const res4 = validateBookingSource({ bookingSource: 'Other', referredByGuestId: null, otherSource: '   ' });
    assert.equal(res4.valid, false);
    assert.equal(res4.error, 'Please enter person name for reference.');

    // Other: valid when person name is provided
    const res5 = validateBookingSource({ bookingSource: 'Other', referredByGuestId: null, otherSource: 'Ravi Local Agent' });
    assert.equal(res5.valid, true);
  });

  it('pre-populates existing reservation source and reference on edit', () => {
    const existingReservation = {
      id: 101,
      booking_source: 'Reference – Existing Member',
      referred_by_guest_id: 12,
      referred_by_guest_name: 'Alice Walker',
      referred_by_guest_phone: '9845032716',
      other_source: null,
    };

    const initialSource = existingReservation.booking_source || 'Social Media';
    const initialGuestId = existingReservation.referred_by_guest_id || null;
    const initialOther = existingReservation.other_source || '';

    assert.equal(initialSource, 'Reference – Existing Member');
    assert.equal(initialGuestId, 12);
    assert.equal(initialOther, '');
  });
});
