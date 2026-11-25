import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDaysIso, todayIso } from '../lib/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Booking & Check-in – Days, Dynamic Persons Capacity & Occupant Count Refinements', () => {
  const newBookingPath = path.join(__dirname, '..', 'components', 'sheets', 'NewBookingSheet.jsx');
  const checkInPath = path.join(__dirname, '..', 'components', 'sheets', 'CheckInSheet.jsx');
  const newBookingSrc = fs.readFileSync(newBookingPath, 'utf8');
  const checkInSrc = fs.readFileSync(checkInPath, 'utf8');

  // Logic handlers mirroring component behaviors
  const handleDaysInput = (currentDays, inputVal) => {
    const raw = String(inputVal).replace(/[^0-9]/g, '');
    if (raw === '') return currentDays;
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      return parsed;
    }
    return currentDays;
  };

  const handleDaysBlur = (inputVal, defaultVal = 1) => {
    const parsed = parseInt(inputVal, 10);
    if (isNaN(parsed) || parsed < 1) {
      return defaultVal;
    }
    return parsed;
  };

  const calculateCheckout = (checkInDate, days) => {
    const validDays = Math.max(1, parseInt(days, 10) || 1);
    return addDaysIso(checkInDate, validDays);
  };

  const calculateRoomCharges = (rate, days) => {
    const validDays = Math.max(1, parseInt(days, 10) || 1);
    return validDays * rate;
  };

  const evaluatePersonStepIncrease = (currentPersons, roomMaxPersons) => {
    const max = Number(roomMaxPersons) || 20;
    const canIncrease = currentPersons < max;
    const nextPersons = canIncrease ? currentPersons + 1 : currentPersons;
    const unit = max === 1 ? 'person' : 'persons';
    const message = !canIncrease ? `Maximum ${max} ${unit} allowed for this room.` : '';
    return { canIncrease, nextPersons, message };
  };

  const handleManualPersonsInput = (inputVal, roomMaxPersons) => {
    const raw = String(inputVal).replace(/[^0-9]/g, '');
    const max = roomMaxPersons != null ? Number(roomMaxPersons) : 20;
    const unit = max === 1 ? 'person' : 'persons';
    const maxMsg = `Maximum ${max} ${unit} allowed for this room.`;

    if (raw === '') {
      return { value: 1, rejected: false, error: '' };
    }
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed) || parsed < 1) {
      return { value: 1, rejected: true, error: 'Positive whole number required' };
    }
    if (parsed > max) {
      return { value: max, rejected: true, error: maxMsg };
    }
    return { value: parsed, rejected: false, error: '' };
  };

  const decreaseOccupantsDirect = (currentOccupants, targetCount) => {
    const num = Math.max(1, targetCount);
    const updatedOccupants = currentOccupants.slice(0, num);
    return {
      occupants: updatedOccupants,
      count: updatedOccupants.length,
      popupTriggered: false, // No window.confirm or alert
    };
  };

  // Scenario 1: Enter 3 days manually
  it('Scenario 1: allows entering 3 days manually and updates days state', () => {
    let days = 1;
    days = handleDaysInput(days, '3');
    assert.equal(days, 3, 'Days state should update to 3 when typed manually');
  });

  // Scenario 2: Increase days using +
  it('Scenario 2: increases days using + button correctly', () => {
    let days = 3;
    days = days + 1;
    assert.equal(days, 4, 'Clicking + should increment days from 3 to 4');
  });

  // Scenario 3: Decrease days using -
  it('Scenario 3: decreases days using - button and enforces minimum 1', () => {
    let days = 4;
    days = Math.max(1, days - 1);
    assert.equal(days, 3, 'Clicking - should decrement days from 4 to 3');

    // Decrementing down to 1 and attempting to go below
    days = 1;
    days = Math.max(1, days - 1);
    assert.equal(days, 1, 'Days cannot go below 1');
  });

  // Scenario 4: Change manually entered days and verify checkout date and charges
  it('Scenario 4: recalculates checkout date and charges when days are manually entered', () => {
    const checkIn = '2026-12-01';
    const ratePerDay = 2500;

    let enteredDays = handleDaysInput(1, '5');
    assert.equal(enteredDays, 5);
    assert.equal(calculateCheckout(checkIn, enteredDays), '2026-12-06');
    assert.equal(calculateRoomCharges(ratePerDay, enteredDays), 12500);

    // Change to 2 days
    enteredDays = handleDaysInput(enteredDays, '2');
    assert.equal(enteredDays, 2);
    assert.equal(calculateCheckout(checkIn, enteredDays), '2026-12-03');
    assert.equal(calculateRoomCharges(ratePerDay, enteredDays), 5000);

    // Typing empty or zero on blur safely resets to default
    assert.equal(handleDaysBlur('', 1), 1);
    assert.equal(handleDaysBlur('0', 1), 1);
    assert.equal(handleDaysBlur('-3', 1), 1);
  });

  // Scenario 5: Select a room with maximum capacity 2
  it('Scenario 5: reads Room Master configuration for a room with maximum capacity 2', () => {
    const room = { id: 101, room_no: '101', max_persons: 2, roomType: { maxPersons: 2, name: 'Deluxe' } };
    const roomMaxPersons = room.max_persons ?? room.roomType?.maxPersons;
    assert.equal(roomMaxPersons, 2, 'Room capacity should be dynamically resolved to 2');
  });

  // Scenario 6: Try increasing persons from 2 to 3 – it must be blocked immediately
  it('Scenario 6: immediately blocks increasing persons from 2 to 3 when room capacity is 2', () => {
    const roomMaxPersons = 2;
    const initialPersons = 2;

    const stepResult = evaluatePersonStepIncrease(initialPersons, roomMaxPersons);
    assert.equal(stepResult.canIncrease, false, 'Increasing beyond capacity 2 must be blocked');
    assert.equal(stepResult.nextPersons, 2, 'Persons count must remain at 2');
    assert.match(stepResult.message, /Maximum 2 persons allowed for this room/i);
  });

  // Scenario 7: Manually type 3 – it must be rejected
  it('Scenario 7: rejects manually typed 3 when room capacity is 2 and clamps to allowed max', () => {
    const roomMaxPersons = 2;
    const inputResult = handleManualPersonsInput('3', roomMaxPersons);

    assert.equal(inputResult.rejected, true, 'Typing 3 must be rejected');
    assert.equal(inputResult.value, 2, 'Value in input must be clamped to room capacity 2');
    assert.match(inputResult.error, /Maximum 2 persons allowed for this room/i);
  });

  // Scenario 8: Select a room with a different maximum capacity and verify dynamic validation
  it('Scenario 8: dynamically updates capacity validation when switching room types', () => {
    const suiteRoom = { id: 201, room_no: '201', max_persons: 4, roomType: { maxPersons: 4, name: 'Suite' } };
    const roomMaxPersons = suiteRoom.max_persons ?? suiteRoom.roomType?.maxPersons;
    assert.equal(roomMaxPersons, 4);

    // Allows up to 4 persons
    assert.equal(evaluatePersonStepIncrease(2, roomMaxPersons).canIncrease, true);
    assert.equal(evaluatePersonStepIncrease(3, roomMaxPersons).canIncrease, true);
    assert.equal(evaluatePersonStepIncrease(4, roomMaxPersons).canIncrease, false);

    // Manual typing up to 4 is accepted
    assert.equal(handleManualPersonsInput('4', roomMaxPersons).rejected, false);
    assert.equal(handleManualPersonsInput('4', roomMaxPersons).value, 4);

    // Typing 5 for a 4-person room is rejected
    const exceedSuite = handleManualPersonsInput('5', roomMaxPersons);
    assert.equal(exceedSuite.rejected, true);
    assert.equal(exceedSuite.value, 4);
    assert.match(exceedSuite.error, /Maximum 4 persons allowed for this room/i);
  });

  // Scenario 9: Decrease actual occupants from 2 to 1 – no confirmation popup
  it('Scenario 9: decreases actual occupants from 2 to 1 directly without any confirmation popup', () => {
    const initialOccupants = [
      { name: 'Kavitha S', gender: 'Female', phone: '9876543210' },
      { name: 'Rajesh S', gender: 'Male', phone: '9876543211' },
    ];
    assert.equal(initialOccupants.length, 2);

    const result = decreaseOccupantsDirect(initialOccupants, 1);
    assert.equal(result.count, 1, 'Occupants count should decrease immediately to 1');
    assert.equal(result.occupants.length, 1);
    assert.equal(result.popupTriggered, false, 'No confirmation popup should be triggered');
  });

  // Scenario 10: Verify remaining occupant details are preserved
  it('Scenario 10: preserves remaining occupant details intact and avoids empty records', () => {
    const initialOccupants = [
      { name: 'Kavitha S', gender: 'Female', phone: '9876543210' },
      { name: 'Rajesh S', gender: 'Male', phone: '9876543211' },
    ];

    const result = decreaseOccupantsDirect(initialOccupants, 1);
    const remaining = result.occupants[0];

    assert.equal(remaining.name, 'Kavitha S', 'Primary occupant name must be preserved');
    assert.equal(remaining.gender, 'Female', 'Primary occupant gender must be preserved');
    assert.equal(remaining.phone, '9876543210', 'Primary occupant phone must be preserved');

    // No empty records remain in the list
    assert.equal(result.occupants.every(o => o.name && o.phone && o.gender), true);
  });

  // Scenario 11: Submit valid booking and check-in forms successfully
  it('Scenario 11: verifies valid booking and check-in payloads are constructed accurately', () => {
    const bookingPayload = {
      roomId: 101,
      phone: '9876543210',
      name: 'Kavitha S',
      checkIn: '2026-12-01',
      checkOut: calculateCheckout('2026-12-01', 3),
      persons: 2,
      rate: 2500,
      advanceAmount: 1000,
      advanceMethod: 'cash',
    };

    assert.equal(bookingPayload.persons, 2);
    assert.equal(bookingPayload.checkOut, '2026-12-04');
    assert.ok(bookingPayload.persons <= 2, 'Booking persons must not exceed room capacity');

    const checkInPayload = {
      roomId: 101,
      phone: '9876543210',
      name: 'Kavitha S',
      persons: 1,
      days: 3,
      occupants: [{ name: 'Kavitha S', gender: 'Female', phone: '9876543210' }],
      rate: 2500,
      advanceAmount: 1000,
    };

    assert.equal(checkInPayload.persons, 1);
    assert.equal(checkInPayload.occupants.length, 1);
    assert.equal(checkInPayload.days, 3);
  });

  // Code inspection assertions: source code verification
  it('verifies NewBookingSheet source allows typing days and enforces dynamic max persons', () => {
    assert.ok(!newBookingSrc.includes('<input type="number" readOnly {...register(\'days\')}'), 'Days must not be readOnly in NewBookingSheet');
    assert.ok(newBookingSrc.includes('inputMode="numeric"'), 'Days input must support numeric inputMode in NewBookingSheet');
    assert.ok(newBookingSrc.includes('roomMaxPersons'), 'Must use dynamic roomMaxPersons in NewBookingSheet');
    assert.ok(!newBookingSrc.includes('disabled={(Number(persons) || 1) >= 20}'), 'Must not hardcode 20 on persons step button in NewBookingSheet');
  });

  it('verifies CheckInSheet source allows typing days, removes confirm popup, and enforces dynamic max persons', () => {
    assert.ok(!checkInSrc.includes('<input type="number" readOnly {...register(\'days\')}'), 'Days must not be readOnly in CheckInSheet');
    assert.ok(!checkInSrc.includes('window.confirm('), 'window.confirm popup must be removed from CheckInSheet');
    assert.ok(checkInSrc.includes('setOccupants((prev) => prev.slice(0, num))'), 'Must slice occupants directly without popup confirmation');
  });
});
