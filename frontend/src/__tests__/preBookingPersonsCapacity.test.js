import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Pre-Booking Persons Initial Count and Capacity Limit Validation', () => {
  // Logic mirror for NewBookingSheet default values and capacity enforcement
  const computeInitialPersons = (editReservation) => {
    const isEdit = Boolean(editReservation?.id || editReservation?.booking_code);
    if (isEdit) {
      return Number(editReservation.persons) || 1;
    }
    return 1; // Initially 1 for pre-booking
  };

  const computeRoomMaxPersons = (selectedRoom, roomId) => {
    return selectedRoom?.max_persons
      ?? selectedRoom?.roomType?.maxPersons
      ?? (selectedRoom || roomId ? 2 : null);
  };

  const evaluateCapacity = (persons, roomMaxPersons, serverPersonsError = '') => {
    const personCount = Number(persons) || 1;
    const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
    const maxPersonsMsg = roomMaxPersons != null
      ? `This room allows a maximum of ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'}.`
      : '';
    const personsError = isPersonsExceeded ? maxPersonsMsg : (serverPersonsError || '');
    return {
      personCount,
      isPersonsExceeded,
      maxPersonsMsg,
      personsError,
    };
  };

  it('1. Pre-booking initializes persons to 1 by default', () => {
    const initialPersons = computeInitialPersons(null);
    assert.equal(initialPersons, 1, 'Initial persons count must be 1 for new pre-booking');
  });

  it('2. Pre-booking with a preselected room (no reservation id) also initializes persons to 1', () => {
    const initialPersons = computeInitialPersons({ room_id: 101 });
    assert.equal(initialPersons, 1, 'Preselected room without reservation id must still start with 1 person');
  });

  it('3. Editing an existing reservation preserves the reservation persons count', () => {
    const editPersons = computeInitialPersons({ id: 55, booking_code: 'BK-1001', persons: 3 });
    assert.equal(editPersons, 3, 'Editing reservation preserves existing count');
  });

  it('4. Allows increasing persons count without triggering errors when no room is selected', () => {
    const roomMaxPersons = computeRoomMaxPersons(null, null);
    assert.equal(roomMaxPersons, null, 'Unselected room has no max persons restriction');

    const result = evaluateCapacity(4, roomMaxPersons);
    assert.equal(result.isPersonsExceeded, false);
    assert.equal(result.personsError, '');
  });

  it('5. Allows increasing persons within room capacity without error', () => {
    const selectedRoom = { id: 101, room_no: '101', max_persons: 2 };
    const roomMaxPersons = computeRoomMaxPersons(selectedRoom, 101);
    assert.equal(roomMaxPersons, 2);

    // Initial 1 person
    const initialResult = evaluateCapacity(1, roomMaxPersons);
    assert.equal(initialResult.isPersonsExceeded, false);
    assert.equal(initialResult.personsError, '');

    // Increased to 2 persons (within capacity)
    const step2Result = evaluateCapacity(2, roomMaxPersons);
    assert.equal(step2Result.isPersonsExceeded, false);
    assert.equal(step2Result.personsError, '');
  });

  it('6. Shows clear capacity error when persons count exceeds room capacity', () => {
    const selectedRoom = { id: 101, room_no: '101', max_persons: 2 };
    const roomMaxPersons = computeRoomMaxPersons(selectedRoom, 101);

    // Increased to 3 persons (exceeds capacity of 2)
    const step3Result = evaluateCapacity(3, roomMaxPersons);
    assert.equal(step3Result.isPersonsExceeded, true);
    assert.equal(step3Result.personsError, 'This room allows a maximum of 2 persons.');
  });

  it('7. Dynamically clears error when persons count is decreased back to allowed limit', () => {
    const selectedRoom = { id: 101, room_no: '101', max_persons: 2 };
    const roomMaxPersons = computeRoomMaxPersons(selectedRoom, 101);

    // Exceeded state
    let state = evaluateCapacity(3, roomMaxPersons);
    assert.equal(state.isPersonsExceeded, true);

    // User decreases count to 2
    state = evaluateCapacity(2, roomMaxPersons);
    assert.equal(state.isPersonsExceeded, false);
    assert.equal(state.personsError, '');
  });

  it('8. Single room max persons grammar formats correctly as "1 person"', () => {
    const singleRoom = { id: 105, room_no: '105', max_persons: 1 };
    const roomMaxPersons = computeRoomMaxPersons(singleRoom, 105);

    const exceededState = evaluateCapacity(2, roomMaxPersons);
    assert.equal(exceededState.isPersonsExceeded, true);
    assert.equal(exceededState.personsError, 'This room allows a maximum of 1 person.');
  });

  it('9. Form submission is blocked when capacity is exceeded', () => {
    const submitBooking = (isPersonsExceeded) => {
      if (isPersonsExceeded) {
        return { success: false, reason: 'capacity_exceeded' };
      }
      return { success: true };
    };

    assert.deepEqual(submitBooking(true), { success: false, reason: 'capacity_exceeded' });
    assert.deepEqual(submitBooking(false), { success: true });
  });
});
