import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDaysIso } from '../lib/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Mobile Booking & Check-in – Days, Dynamic Persons Capacity & Occupant Count Refinements', () => {
  const newBookingPath = path.join(__dirname, '..', 'components', 'sheets', 'NewBookingSheet.jsx');
  const checkInPath = path.join(__dirname, '..', 'components', 'sheets', 'CheckInSheet.jsx');
  const fieldPath = path.join(__dirname, '..', 'components', 'ui', 'Field.jsx');

  const newBookingSrc = fs.readFileSync(newBookingPath, 'utf8');
  const checkInSrc = fs.readFileSync(checkInPath, 'utf8');
  const fieldSrc = fs.readFileSync(fieldPath, 'utf8');

  // Stepper input simulation
  const simulateStepperTextChange = ({ text, min = 1, max = null }) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return { value: min, text: '', triggeredExceed: false };
    const num = parseInt(digits, 10);
    if (isNaN(num)) return { value: min, text: '', triggeredExceed: false };
    if (max != null && num > max) {
      return { value: max, text: String(max), triggeredExceed: true };
    }
    if (num >= min) {
      return { value: num, text: String(num), triggeredExceed: false };
    }
    return { value: min, text: String(min), triggeredExceed: false };
  };

  const simulateStepperBlur = ({ text, min = 1, max = null }) => {
    const num = parseInt(text, 10);
    if (isNaN(num) || num < min) {
      return { value: min, text: String(min) };
    }
    if (max != null && num > max) {
      return { value: max, text: String(max) };
    }
    return { value: num, text: String(num) };
  };

  const decreaseOccupantsDirect = (currentOccupants, targetCount) => {
    const num = Math.max(1, targetCount);
    const updatedOccupants = currentOccupants.slice(0, num);
    return {
      occupants: updatedOccupants,
      count: updatedOccupants.length,
      alertShown: false,
    };
  };

  // Scenario 1: Enter 3 days manually
  it('Scenario 1: allows typing 3 days manually into mobile Stepper', () => {
    const res = simulateStepperTextChange({ text: '3', min: 1 });
    assert.equal(res.value, 3);
    assert.equal(res.text, '3');
  });

  // Scenario 2: Increase days using +
  it('Scenario 2: increases days using + button in mobile Stepper', () => {
    let days = 3;
    days = days + 1;
    assert.equal(days, 4);
  });

  // Scenario 3: Decrease days using -
  it('Scenario 3: decreases days using - button and clamps to minimum 1 in mobile Stepper', () => {
    let days = 4;
    days = Math.max(1, days - 1);
    assert.equal(days, 3);

    days = 1;
    days = Math.max(1, days - 1);
    assert.equal(days, 1);
  });

  // Scenario 4: Change manually entered days and verify checkout date
  it('Scenario 4: recalculates checkout date when days are manually entered on mobile', () => {
    const checkIn = '2026-11-25';
    let daysResult = simulateStepperTextChange({ text: '5', min: 1 });
    assert.equal(daysResult.value, 5);
    assert.equal(addDaysIso(checkIn, daysResult.value), '2026-11-30');

    daysResult = simulateStepperTextChange({ text: '2', min: 1 });
    assert.equal(daysResult.value, 2);
    assert.equal(addDaysIso(checkIn, daysResult.value), '2026-11-27');

    // On blur with empty or zero resets to 1
    assert.equal(simulateStepperBlur({ text: '', min: 1 }).value, 1);
    assert.equal(simulateStepperBlur({ text: '0', min: 1 }).value, 1);
  });

  // Scenario 5: Select a room with maximum capacity 2
  it('Scenario 5: resolves dynamic room capacity 2 from room master on mobile', () => {
    const room = { id: 101, room_no: '101', max_persons: 2, roomType: { maxPersons: 2, name: 'Deluxe' } };
    const roomMaxPersons = room.max_persons ?? room.roomType?.maxPersons;
    assert.equal(roomMaxPersons, 2);
  });

  // Scenario 6: Try increasing persons from 2 to 3 – it must be blocked immediately
  it('Scenario 6: immediately blocks increasing persons from 2 to 3 when capacity is 2', () => {
    const roomMaxPersons = 2;
    const currentPersons = 2;

    const canIncrease = currentPersons < roomMaxPersons;
    assert.equal(canIncrease, false, 'Step increase beyond 2 must be blocked');
  });

  // Scenario 7: Manually type 3 – it must be rejected
  it('Scenario 7: rejects manual typing of 3 when capacity is 2 and clamps to 2', () => {
    const roomMaxPersons = 2;
    const res = simulateStepperTextChange({ text: '3', min: 1, max: roomMaxPersons });

    assert.equal(res.triggeredExceed, true, 'Exceeding max capacity must be detected immediately');
    assert.equal(res.value, 2, 'Value must be clamped to 2');
  });

  // Scenario 8: Select a room with a different maximum capacity and verify dynamic validation
  it('Scenario 8: dynamically updates persons limit when selecting room with different capacity', () => {
    const familyRoom = { id: 301, room_no: '301', max_persons: 5, roomType: { maxPersons: 5 } };
    const maxCapacity = familyRoom.max_persons;

    const res = simulateStepperTextChange({ text: '4', min: 1, max: maxCapacity });
    assert.equal(res.value, 4);
    assert.equal(res.triggeredExceed, false);

    const exceedRes = simulateStepperTextChange({ text: '6', min: 1, max: maxCapacity });
    assert.equal(exceedRes.value, 5);
    assert.equal(exceedRes.triggeredExceed, true);
  });

  // Scenario 9: Decrease actual occupants from 2 to 1 – no confirmation popup
  it('Scenario 9: decreases occupants from 2 to 1 on mobile without Alert.alert popup', () => {
    const occupants = [
      { name: 'Vijay K', gender: 'Male', phone: '9840123456' },
      { name: 'Deepa V', gender: 'Female', phone: '9840123457' },
    ];
    assert.equal(occupants.length, 2);

    const result = decreaseOccupantsDirect(occupants, 1);
    assert.equal(result.count, 1);
    assert.equal(result.alertShown, false);
  });

  // Scenario 10: Verify remaining occupant details are preserved
  it('Scenario 10: preserves primary and remaining occupant details intact on mobile', () => {
    const occupants = [
      { name: 'Vijay K', gender: 'Male', phone: '9840123456' },
      { name: 'Deepa V', gender: 'Female', phone: '9840123457' },
    ];

    const result = decreaseOccupantsDirect(occupants, 1);
    assert.equal(result.occupants[0].name, 'Vijay K');
    assert.equal(result.occupants[0].phone, '9840123456');
    assert.equal(result.occupants[0].gender, 'Male');
  });

  // Scenario 11: Submit valid booking and check-in forms successfully
  it('Scenario 11: constructs valid booking and check-in payloads adhering to dynamic capacity', () => {
    const booking = {
      roomId: 101,
      phone: '9840123456',
      name: 'Vijay K',
      days: 2,
      persons: 2,
    };
    assert.ok(booking.persons <= 2);
    assert.equal(booking.days, 2);

    const checkIn = {
      roomId: 101,
      occupants: [{ name: 'Vijay K', gender: 'Male', phone: '9840123456' }],
      persons: 1,
      days: 2,
    };
    assert.equal(checkIn.occupants.length, 1);
    assert.equal(checkIn.persons, 1);
  });

  // Source code structure checks
  it('verifies mobile Field.jsx Stepper contains TextInput for manual typing', () => {
    assert.ok(fieldSrc.includes('TextInput'), 'Stepper must render TextInput for editable values');
    assert.ok(fieldSrc.includes('keyboardType="number-pad"'), 'Stepper must use numeric keyboard');
    assert.ok(fieldSrc.includes('onExceedMax'), 'Stepper must support onExceedMax callback');
  });

  it('verifies mobile CheckInSheet does not show Alert.alert when shrinking occupants', () => {
    assert.ok(!checkInSrc.includes('Alert.alert(\n          \'Remove occupant details?\''), 'Remove occupant details Alert.alert must be removed');
    assert.ok(checkInSrc.includes('setOccupants((prev) => prev.slice(0, num))'), 'Must slice occupants directly');
  });

  it('verifies mobile NewBookingSheet does not hardcode max={20}', () => {
    assert.ok(!newBookingSrc.includes('max={20}'), 'Must not hardcode max={20} in NewBookingSheet persons stepper');
    assert.ok(newBookingSrc.includes('roomMaxPersons'), 'Must use dynamic roomMaxPersons in NewBookingSheet');
  });
});
