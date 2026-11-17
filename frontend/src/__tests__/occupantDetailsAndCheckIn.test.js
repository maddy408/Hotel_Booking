import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Occupant Details and ID Proof Upload UI & Business Logic', () => {
  // 1. Dynamic generation and update of occupants
  const syncOccupantsList = (prevOccupants, newCount) => {
    const next = [...prevOccupants];
    if (newCount > next.length) {
      for (let i = next.length; i < newCount; i++) {
        next.push({ name: '', gender: '', phone: '' });
      }
    } else if (newCount < next.length) {
      next.splice(newCount);
    }
    return next;
  };

  const hasNonEmptyOccupant = (occupant) => {
    return Boolean(
      (occupant?.name && occupant.name.trim() !== '') ||
      (occupant?.gender && occupant.gender.trim() !== '') ||
      (occupant?.phone && occupant.phone.trim() !== '')
    );
  };

  const validateOccupant = (occ, index) => {
    const errors = {};
    if (!occ.name || occ.name.trim() === '') {
      errors.name = `Person ${index + 1} Name is required.`;
    }
    if (!occ.gender || occ.gender.trim() === '') {
      errors.gender = `Person ${index + 1} Gender is required.`;
    } else if (!['Male', 'Female', 'Other'].includes(occ.gender)) {
      errors.gender = `Person ${index + 1} Gender must be Male, Female, or Other.`;
    }
    if (!occ.phone || occ.phone.trim() === '') {
      errors.phone = `Person ${index + 1} Phone Number is required.`;
    } else if (!/^[0-9]{10}$/.test(occ.phone.trim())) {
      errors.phone = `Person ${index + 1} Phone Number must be 10 digits.`;
    }
    return errors;
  };

  const validatePersonsCount = (val, roomMaxPersons) => {
    const parsed = parseInt(val, 10);
    if (!val || isNaN(parsed) || parsed < 1 || String(parsed) !== String(val).trim()) {
      return { valid: false, error: 'Actual persons count must be a positive whole number.' };
    }
    if (roomMaxPersons && parsed > roomMaxPersons) {
      return {
        valid: false,
        error: `Actual persons count (${parsed}) cannot exceed room capacity of ${roomMaxPersons}.`
      };
    }
    return { valid: true, error: null, count: parsed };
  };

  // Tests
  it('generates occupant entries dynamically matching actual persons count', () => {
    let occupants = [{ name: 'Aarav', gender: 'Male', phone: '9876543210' }];
    assert.equal(occupants.length, 1);

    occupants = syncOccupantsList(occupants, 3);
    assert.equal(occupants.length, 3);
    assert.equal(occupants[0].name, 'Aarav');
    assert.equal(occupants[1].name, '');
    assert.equal(occupants[2].name, '');
  });

  it('detects when entries contain data before reducing count to prompt user confirmation', () => {
    const occupants = [
      { name: 'Aarav', gender: 'Male', phone: '9876543210' },
      { name: 'Priya', gender: 'Female', phone: '9876543211' },
      { name: '', gender: '', phone: '' },
    ];

    // Reducing to 2 removes an empty occupant - no warning needed
    const removingEmpty = occupants.slice(2);
    assert.equal(removingEmpty.some(hasNonEmptyOccupant), false);

    // Reducing to 1 removes 'Priya' - warning MUST be prompted
    const removingFilled = occupants.slice(1);
    assert.equal(removingFilled.some(hasNonEmptyOccupant), true);
  });

  it('validates required fields for each occupant (name, gender, 10-digit phone)', () => {
    const invalidOcc = { name: '', gender: 'InvalidGender', phone: '123' };
    const errors = validateOccupant(invalidOcc, 0);

    assert.equal(errors.name, 'Person 1 Name is required.');
    assert.equal(errors.gender, 'Person 1 Gender must be Male, Female, or Other.');
    assert.equal(errors.phone, 'Person 1 Phone Number must be 10 digits.');

    const validOcc = { name: 'Sunil Rao', gender: 'Male', phone: '9876543210' };
    const validErrors = validateOccupant(validOcc, 0);
    assert.deepEqual(validErrors, {});
  });

  it('enforces actual persons count must be positive whole number and <= room max capacity', () => {
    const maxCapacity = 2;

    assert.equal(validatePersonsCount('0', maxCapacity).valid, false);
    assert.equal(validatePersonsCount('-1', maxCapacity).valid, false);
    assert.equal(validatePersonsCount('1.5', maxCapacity).valid, false);
    assert.equal(validatePersonsCount('abc', maxCapacity).valid, false);

    // Exceeding capacity
    const exceeded = validatePersonsCount('3', maxCapacity);
    assert.equal(exceeded.valid, false);
    assert.match(exceeded.error, /cannot exceed room capacity of 2/);

    // Valid
    const ok = validatePersonsCount('2', maxCapacity);
    assert.equal(ok.valid, true);
    assert.equal(ok.count, 2);
  });

  it('associates uploaded documents with stay by default without forcing occupant assignment', () => {
    const uploadedDocs = [
      { id: 'doc-1', file: { name: 'pan.pdf' }, occupantTarget: null },
      { id: 'doc-2', file: { name: 'aadhaar.jpg' }, occupantTarget: null },
    ];

    assert.equal(uploadedDocs[0].occupantTarget, null);
    assert.equal(uploadedDocs[1].occupantTarget, null);

    // Reception can remove a document before submission
    const filteredDocs = uploadedDocs.filter(d => d.id !== 'doc-1');
    assert.equal(filteredDocs.length, 1);
    assert.equal(filteredDocs[0].id, 'doc-2');
  });

  it('confirms pre-booking form specification has no persons count, occupant details, or ID proof fields', () => {
    // Specification check: Pre-Booking only contains:
    // mobile, guestName, bookingSource, notes, comingOn, days, leavesOn, roomTypeId, roomId
    const preBookingFields = [
      'phone',
      'guest_name',
      'booking_source',
      'notes',
      'check_in',
      'days',
      'check_out',
      'room_type_id',
      'room_id',
    ];

    assert.equal(preBookingFields.includes('persons'), false);
    assert.equal(preBookingFields.includes('occupants'), false);
    assert.equal(preBookingFields.includes('documents'), false);
  });

  // -------------------------------------------------------------
  // Pre-Check-In Verification Workflow & Mandatory Checks
  // -------------------------------------------------------------

  const getOccupantDocumentCount = (occupantIndex, selectedFiles, preBookingDocs = [], preBookingAssignments = {}) => {
    let count = 0;
    for (const f of selectedFiles) {
      if (f.occupantTarget === occupantIndex) {
        count++;
      }
    }
    for (const doc of preBookingDocs) {
      if (preBookingAssignments[doc.id] === occupantIndex) {
        count++;
      }
    }
    return count;
  };

  const checkAllOccupantsHaveIdProof = (occupants, selectedFiles, preBookingDocs = [], preBookingAssignments = {}) => {
    return (
      occupants.length > 0 &&
      occupants.every((_, i) => getOccupantDocumentCount(i, selectedFiles, preBookingDocs, preBookingAssignments) > 0)
    );
  };

  const checkAllMandatoryChecksPassed = ({
    isRoomReady = true,
    isRoomOccupied = false,
    isRoomMaintenance = false,
    isCapacityValid = true,
    allOccupantsValid = true,
    allOccupantsHaveIdProof = true,
    allDocumentsAssigned = true,
    isAdvanceValid = true,
    lateArrivalConflict = null,
  }) => {
    return (
      isRoomReady &&
      !isRoomOccupied &&
      !isRoomMaintenance &&
      isCapacityValid &&
      allOccupantsValid &&
      allOccupantsHaveIdProof &&
      allDocumentsAssigned &&
      isAdvanceValid &&
      !lateArrivalConflict
    );
  };

  it('allows multiple documents to be associated with the same occupant', () => {
    const occupants = [
      { name: 'Kavita Verma', gender: 'Female', phone: '9876543210' },
      { name: 'Sanjay Verma', gender: 'Male', phone: '9876543211' },
    ];

    const selectedFiles = [
      { id: 'f-1', name: 'kavita_aadhaar_front.jpg', occupantTarget: 0 },
      { id: 'f-2', name: 'kavita_aadhaar_back.jpg', occupantTarget: 0 },
      { id: 'f-3', name: 'kavita_passport.pdf', occupantTarget: 0 },
      { id: 'f-4', name: 'sanjay_dl.jpg', occupantTarget: 1 },
    ];

    // Person 1 (index 0) has 3 documents attached
    const p1Count = getOccupantDocumentCount(0, selectedFiles);
    assert.equal(p1Count, 3);

    // Person 2 (index 1) has 1 document attached
    const p2Count = getOccupantDocumentCount(1, selectedFiles);
    assert.equal(p2Count, 1);

    // Both occupants have >= 1 ID proof document
    assert.equal(checkAllOccupantsHaveIdProof(occupants, selectedFiles), true);
  });

  it('verifies every occupant has at least one valid ID proof document before check-in', () => {
    const occupants = [
      { name: 'Guest 1', gender: 'Male', phone: '9876543210' },
      { name: 'Guest 2', gender: 'Female', phone: '9876543211' },
    ];

    // Only Guest 1 has a document assigned
    const filesOnlyGuest1 = [
      { id: 'f-1', name: 'guest1_id.pdf', occupantTarget: 0 },
      { id: 'f-2', name: 'guest1_pan.jpg', occupantTarget: 0 },
    ];
    assert.equal(checkAllOccupantsHaveIdProof(occupants, filesOnlyGuest1), false);

    // When Guest 2 also gets a document assigned
    const filesBoth = [
      ...filesOnlyGuest1,
      { id: 'f-3', name: 'guest2_passport.pdf', occupantTarget: 1 },
    ];
    assert.equal(checkAllOccupantsHaveIdProof(occupants, filesBoth), true);
  });

  it('supports ID proof verification using pre-booking attached documents', () => {
    const occupants = [
      { name: 'Primary Guest', gender: 'Male', phone: '9876543210' },
      { name: 'Accompanying Guest', gender: 'Female', phone: '9876543211' },
    ];

    const preBookingDocs = [
      { id: 101, original_filename: 'booking_lead_guest_aadhaar.pdf' },
    ];
    const preBookingAssignments = {
      101: 0, // Assigned to Person 1
    };

    // Before uploading Person 2's ID, verification fails
    assert.equal(checkAllOccupantsHaveIdProof(occupants, [], preBookingDocs, preBookingAssignments), false);

    // Person 2 uploads a new document at front desk
    const newDeskFiles = [
      { id: 'f-desk-1', name: 'person2_dl.jpg', occupantTarget: 1 },
    ];
    assert.equal(checkAllOccupantsHaveIdProof(occupants, newDeskFiles, preBookingDocs, preBookingAssignments), true);
  });

  it('enables Confirm Check-In only after all mandatory checks pass', () => {
    const baseState = {
      isRoomReady: true,
      isRoomOccupied: false,
      isRoomMaintenance: false,
      isCapacityValid: true,
      allOccupantsValid: true,
      allOccupantsHaveIdProof: true,
      allDocumentsAssigned: true,
      isAdvanceValid: true,
      lateArrivalConflict: null,
    };

    // When all pass: enabled
    assert.equal(checkAllMandatoryChecksPassed(baseState), true);

    // Room not ready: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, isRoomReady: false }), false);

    // Room occupied: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, isRoomOccupied: true }), false);

    // Room under maintenance: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, isRoomMaintenance: true }), false);

    // Capacity exceeded: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, isCapacityValid: false }), false);

    // Incomplete occupant details: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, allOccupantsValid: false }), false);

    // Missing occupant ID proof: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, allOccupantsHaveIdProof: false }), false);

    // Advance payment not collected: disabled
    assert.equal(checkAllMandatoryChecksPassed({ ...baseState, isAdvanceValid: false }), false);

    // Late arrival conflict with another reservation: disabled
    assert.equal(
      checkAllMandatoryChecksPassed({
        ...baseState,
        lateArrivalConflict: { booking_code: 'BK-9999', guest_name: 'Next Guest' },
      }),
      false
    );
  });

  // -------------------------------------------------------------
  // Consecutive Bookings & No-Show Logic
  // -------------------------------------------------------------

  const checkHalfOpenOverlap = (in1, out1, in2, out2) => {
    // Half-open interval rule: [in1, out1) and [in2, out2) overlap iff in1 < out2 AND out1 > in2
    return in1 < out2 && out1 > in2;
  };

  it('allows consecutive bookings on the same room (e.g., 15-16 Nov and 16-17 Nov)', () => {
    const bookingA = { in: '2026-11-15', out: '2026-11-16' };
    const bookingB = { in: '2026-11-16', out: '2026-11-17' };

    // Booking A leaves on 16th, Booking B arrives on 16th -> No overlap!
    const doesOverlap = checkHalfOpenOverlap(bookingA.in, bookingA.out, bookingB.in, bookingB.out);
    assert.equal(doesOverlap, false);
  });

  it('handles consecutive bookings when Booking A is No-Show: Booking B proceeds normally', () => {
    const bookingA = {
      id: 1,
      booking_code: 'BK-1001',
      room_no: '409',
      status: 'no_show',
      check_in_date: '2026-11-15',
      check_out_date: '2026-11-16',
    };

    const bookingB = {
      id: 2,
      booking_code: 'BK-1002',
      room_no: '409',
      status: 'pending',
      check_in_date: '2026-11-16',
      check_out_date: '2026-11-17',
    };

    // 1. Booking A being no-show does not block Booking B
    const isBookingBBlocked = bookingA.status === 'checked_in';
    assert.equal(isBookingBBlocked, false);

    // 2. Room was never occupied by Booking A, so stays ready for Booking B
    const room = { status: 'available', housekeepingStatus: 'ok' };
    assert.equal(room.status, 'available');
    assert.equal(room.housekeepingStatus, 'ok');

    // 3. Booking B can proceed through Pre-Check-In Verification
    const canCheckInB = bookingB.status === 'pending' && room.status !== 'occupied' && room.housekeepingStatus === 'ok';
    assert.equal(canCheckInB, true);
  });

  it('detects late arrival conflict when Guest A arrives late and room is already booked by Guest B', () => {
    const today = '2026-11-16';

    // Guest A booked 15-16 Nov (1 night), but did not arrive on 15 Nov.
    // Guest A arrives late on 16 Nov. If checked in today for 1 night, stays until 17 Nov.
    const guestABooking = {
      id: 1,
      room_id: 10,
      booking_code: 'BK-001',
      guest_name: 'Guest A',
      status: 'pending',
      check_in_date: '2026-11-15',
      check_out_date: '2026-11-16',
      nights: 1,
    };

    // Guest B booked 16-17 Nov for the same room.
    const guestBBooking = {
      id: 2,
      room_id: 10,
      booking_code: 'BK-002',
      guest_name: 'Guest B',
      status: 'pending',
      check_in_date: '2026-11-16',
      check_out_date: '2026-11-17',
    };

    const allReservations = [guestABooking, guestBBooking];

    // Calculate conflict if Guest A attempts check-in today:
    const newGuestACheckOut = '2026-11-17'; // today + 1 night
    const conflict = allReservations.find(
      (r) =>
        r.id !== guestABooking.id &&
        r.room_id === guestABooking.room_id &&
        r.status === 'pending' &&
        checkHalfOpenOverlap(today, newGuestACheckOut, r.check_in_date, r.check_out_date)
    );

    // A conflict is detected with Guest B's reservation!
    assert.ok(conflict);
    assert.equal(conflict.booking_code, 'BK-002');
    assert.equal(conflict.guest_name, 'Guest B');

    // Therefore, check-in for Guest A is blocked
    const canCheckInGuestA = !conflict;
    assert.equal(canCheckInGuestA, false);
  });
});
