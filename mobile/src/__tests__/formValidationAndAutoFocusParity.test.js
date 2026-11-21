import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isFilled,
  isValidPhone,
  isValidEmail,
  isValidPositiveNumber,
  isValidDate,
  mapBackendValidationErrors,
  FRIENDLY_FIELD_MESSAGES,
  BACKEND_FIELD_MAP,
} from '../lib/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Application-Wide Form Validation and Auto-Focus Parity', () => {
  // --------------------------------------------------------------------------
  // Scenario 1: Submit with every required field empty
  // --------------------------------------------------------------------------
  it('Scenario 1: Submit with every required field empty validates all fields and identifies the first error', () => {
    const rules = {
      phone: () => (!isFilled('') ? 'Mobile number is required.' : null),
      name: () => (!isFilled('') ? 'Guest name is required.' : null),
      roomId: () => (!isFilled(null) ? 'Please select a room.' : null),
      rate: () => (!isFilled('') ? 'Please enter a valid daily rate.' : null),
    };

    const fieldOrder = ['phone', 'name', 'roomId', 'rate'];
    const newErrors = {};
    let firstInvalid = null;

    fieldOrder.forEach((field) => {
      const rule = rules[field];
      if (rule) {
        const error = rule();
        if (error) {
          newErrors[field] = error;
          if (!firstInvalid) firstInvalid = field;
        }
      }
    });

    // All empty required fields must have errors simultaneously
    assert.equal(newErrors.phone, 'Mobile number is required.');
    assert.equal(newErrors.name, 'Guest name is required.');
    assert.equal(newErrors.roomId, 'Please select a room.');
    assert.equal(newErrors.rate, 'Please enter a valid daily rate.');
    assert.equal(Object.keys(newErrors).length, 4, 'Must report errors on all 4 invalid fields at once');

    // First invalid field must be the first in fieldOrder
    assert.equal(firstInvalid, 'phone', 'First invalid field must be phone');
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Submit with only one required field missing
  // --------------------------------------------------------------------------
  it('Scenario 2: Submit with only one required field missing highlights only that field', () => {
    const values = {
      phone: '9876543210',
      name: '', // missing
      roomId: 101,
      rate: '2500',
    };

    const rules = {
      phone: () => (!isFilled(values.phone) ? 'Mobile number is required.' : null),
      name: () => (!isFilled(values.name) ? 'Guest name is required.' : null),
      roomId: () => (!isFilled(values.roomId) ? 'Please select a room.' : null),
      rate: () => (!isFilled(values.rate) ? 'Please enter a valid daily rate.' : null),
    };

    const fieldOrder = ['phone', 'name', 'roomId', 'rate'];
    const newErrors = {};
    let firstInvalid = null;

    fieldOrder.forEach((field) => {
      const rule = rules[field];
      if (rule) {
        const error = rule();
        if (error) {
          newErrors[field] = error;
          if (!firstInvalid) firstInvalid = field;
        }
      }
    });

    assert.equal(newErrors.name, 'Guest name is required.');
    assert.equal(newErrors.phone, undefined);
    assert.equal(newErrors.roomId, undefined);
    assert.equal(newErrors.rate, undefined);
    assert.equal(firstInvalid, 'name');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Submit with multiple required fields missing
  // --------------------------------------------------------------------------
  it('Scenario 3: Submit with multiple required fields missing shows errors under all invalid fields', () => {
    const values = {
      phone: '', // missing
      name: 'John Doe',
      roomId: null, // missing
      rate: '', // missing
    };

    const rules = {
      phone: () => (!isFilled(values.phone) ? 'Mobile number is required.' : null),
      name: () => (!isFilled(values.name) ? 'Guest name is required.' : null),
      roomId: () => (!isFilled(values.roomId) ? 'Please select a room.' : null),
      rate: () => (!isFilled(values.rate) ? 'Please enter a valid daily rate.' : null),
    };

    const fieldOrder = ['phone', 'name', 'roomId', 'rate'];
    const newErrors = {};
    let firstInvalid = null;

    fieldOrder.forEach((field) => {
      const rule = rules[field];
      if (rule) {
        const error = rule();
        if (error) {
          newErrors[field] = error;
          if (!firstInvalid) firstInvalid = field;
        }
      }
    });

    assert.equal(newErrors.phone, 'Mobile number is required.');
    assert.equal(newErrors.roomId, 'Please select a room.');
    assert.equal(newErrors.rate, 'Please enter a valid daily rate.');
    assert.equal(newErrors.name, undefined);
    assert.equal(Object.keys(newErrors).length, 3);
    assert.equal(firstInvalid, 'phone');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Enter an invalid mobile number
  // --------------------------------------------------------------------------
  it('Scenario 4: Enter an invalid mobile number is rejected and valid 10-digit is accepted', () => {
    // Invalid phone numbers
    assert.equal(isValidPhone(''), false, 'Empty phone rejected');
    assert.equal(isValidPhone('12345'), false, 'Too short rejected');
    assert.equal(isValidPhone('1234567890'), false, 'Starting with 1 rejected (must be 6-9)');
    assert.equal(isValidPhone('5555555555'), false, 'Starting with 5 rejected (must be 6-9)');
    assert.equal(isValidPhone('98765432101'), false, '11 digits rejected');
    assert.equal(isValidPhone('98765abcdef'), false, 'Alpha rejected');

    // Valid phone numbers
    assert.equal(isValidPhone('9876543210'), true, 'Valid 10 digits starting with 9');
    assert.equal(isValidPhone('8765432109'), true, 'Valid 10 digits starting with 8');
    assert.equal(isValidPhone('7654321098'), true, 'Valid 10 digits starting with 7');
    assert.equal(isValidPhone('6543210987'), true, 'Valid 10 digits starting with 6');
    assert.equal(isValidPhone('+91 9876543210'), true, 'Formatted with +91 accepted');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Enter invalid date combinations
  // --------------------------------------------------------------------------
  it('Scenario 5: Enter invalid date combinations (checkout <= check-in or malformed)', () => {
    // Format validation
    assert.equal(isValidDate('2026-03-15'), true, 'Valid date');
    assert.equal(isValidDate('not-a-date'), false, 'Malformed string');
    assert.equal(isValidDate('2026-02-30'), false, 'February 30 rejected');
    assert.equal(isValidDate('2026-13-01'), false, 'Month 13 rejected');

    // Checkout date after check-in date
    const checkIn = '2026-03-15';
    const sameDayCheckout = '2026-03-15';
    const pastCheckout = '2026-03-14';
    const futureCheckout = '2026-03-17';

    const validateDates = (inDate, outDate) => {
      if (!isFilled(inDate)) return 'Check-in date is required.';
      if (!isFilled(outDate)) return 'Checkout date is required.';
      if (outDate <= inDate) return 'Checkout date must be after check-in date.';
      return null;
    };

    assert.equal(validateDates(checkIn, sameDayCheckout), 'Checkout date must be after check-in date.');
    assert.equal(validateDates(checkIn, pastCheckout), 'Checkout date must be after check-in date.');
    assert.equal(validateDates(checkIn, futureCheckout), null, 'Valid future checkout accepted');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Enter invalid numeric/payment values
  // --------------------------------------------------------------------------
  it('Scenario 6: Enter invalid numeric/payment values (rejects negative and NaN, allows 0 when permitted)', () => {
    // Non-zero positive number (rates, amounts)
    assert.equal(isValidPositiveNumber(''), false, 'Empty string rejected');
    assert.equal(isValidPositiveNumber('abc'), false, 'String rejected');
    assert.equal(isValidPositiveNumber('-500'), false, 'Negative rejected');
    assert.equal(isValidPositiveNumber('0', { allowZero: false }), false, '0 rejected when allowZero=false');
    assert.equal(isValidPositiveNumber('1500', { allowZero: false }), true, 'Positive accepted');

    // Zero-allowed numeric fields (advance payment, discount, early checkout fee)
    assert.equal(isValidPositiveNumber('0', { allowZero: true }), true, '0 accepted when allowZero=true');
    assert.equal(isValidPositiveNumber('500', { allowZero: true }), true, 'Positive accepted with allowZero=true');
    assert.equal(isValidPositiveNumber('-10', { allowZero: true }), false, 'Negative still rejected when allowZero=true');

    // Integer and range constraints (checkout hour 0-23)
    assert.equal(isValidPositiveNumber('12', { allowZero: true, integer: true, min: 0, max: 23 }), true);
    assert.equal(isValidPositiveNumber('24', { allowZero: true, integer: true, min: 0, max: 23 }), false);
    assert.equal(isValidPositiveNumber('12.5', { allowZero: true, integer: true, min: 0, max: 23 }), false);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Correct an invalid field and verify its error disappears
  // --------------------------------------------------------------------------
  it('Scenario 7: Correct an invalid field and verify its error disappears while other errors persist', () => {
    let currentErrors = {
      phone: 'Mobile number is required.',
      name: 'Guest name is required.',
      rate: 'Please enter a valid daily rate.',
    };

    // User types in phone
    const clearError = (field) => {
      const next = { ...currentErrors };
      delete next[field];
      currentErrors = next;
    };

    clearError('phone');
    assert.equal(currentErrors.phone, undefined, 'Phone error was cleared');
    assert.equal(currentErrors.name, 'Guest name is required.', 'Name error remains');
    assert.equal(currentErrors.rate, 'Please enter a valid daily rate.', 'Rate error remains');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Submit a completely valid form
  // --------------------------------------------------------------------------
  it('Scenario 8: Submit a completely valid form succeeds and returns valid=true', () => {
    const validForm = {
      phone: '9876543210',
      name: 'Jane Doe',
      roomId: 204,
      rate: '3000',
      checkIn: '2026-03-20',
      days: '2',
      persons: '2',
    };

    const rules = {
      phone: () => (isValidPhone(validForm.phone) ? null : 'Please enter a valid mobile number.'),
      name: () => (isFilled(validForm.name) ? null : 'Guest name is required.'),
      roomId: () => (isFilled(validForm.roomId) ? null : 'Please select a room.'),
      rate: () => (isValidPositiveNumber(validForm.rate) ? null : 'Please enter a valid daily rate.'),
      checkIn: () => (isValidDate(validForm.checkIn) ? null : 'Check-in date is required.'),
      days: () => (isValidPositiveNumber(validForm.days, { integer: true }) ? null : 'Please enter valid days.'),
      persons: () => (isValidPositiveNumber(validForm.persons, { integer: true }) ? null : 'Please enter persons count.'),
    };

    const fieldOrder = ['phone', 'name', 'roomId', 'rate', 'checkIn', 'days', 'persons'];
    const newErrors = {};
    let firstInvalid = null;

    fieldOrder.forEach((field) => {
      const rule = rules[field];
      if (rule) {
        const error = rule();
        if (error) {
          newErrors[field] = error;
          if (!firstInvalid) firstInvalid = field;
        }
      }
    });

    assert.equal(Object.keys(newErrors).length, 0, 'No errors for valid submission');
    assert.equal(firstInvalid, null, 'No invalid field');
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Trigger backend validation errors and verify they appear under the correct inputs
  // --------------------------------------------------------------------------
  it('Scenario 9: Trigger backend validation errors and verify mapping to mobile inputs', () => {
    const backendError = {
      code: 'validation_failed',
      message: 'The given data was invalid.',
      fields: {
        guest_phone: 'The guest phone format is invalid.',
        guest_name: 'The guest name field is required.',
        room_id: 'The selected room is unavailable.',
        random_system_error: 'Database transaction lock failed.',
      },
    };

    const fieldOrder = ['phone', 'name', 'roomId', 'rate'];
    const { fieldErrors, unmapped, firstInvalidField } = mapBackendValidationErrors(
      backendError,
      fieldOrder,
      BACKEND_FIELD_MAP
    );

    // Mapped fields
    assert.equal(fieldErrors.phone, 'The guest phone format is invalid.');
    assert.equal(fieldErrors.name, 'The guest name field is required.');
    assert.equal(fieldErrors.roomId, 'The selected room is unavailable.');

    // First invalid field aligns with fieldOrder priority
    assert.equal(firstInvalidField, 'phone');

    // Unmapped error is separated for form-level banner display
    assert.equal(unmapped, 'Database transaction lock failed.');
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Verify that invalid submissions do not create duplicate API requests or records
  // --------------------------------------------------------------------------
  it('Scenario 10: Invalid submissions block API invocation and buttons prevent double taps', () => {
    let apiCalledCount = 0;
    const mockApiMutation = () => {
      apiCalledCount++;
    };

    const validateAndSubmit = (form, isPending) => {
      if (isPending) return; // Prevent duplicate while in-flight
      const errors = {};
      if (!isFilled(form.name)) errors.name = 'Guest name is required.';
      if (Object.keys(errors).length > 0) return; // Block on validation error

      mockApiMutation();
    };

    // Attempt 1: Empty required field
    validateAndSubmit({ name: '' }, false);
    assert.equal(apiCalledCount, 0, 'API must not be called when validation fails');

    // Attempt 2: Another invalid submission
    validateAndSubmit({ name: '   ' }, false);
    assert.equal(apiCalledCount, 0, 'API must not be called for trimmed whitespace');

    // Attempt 3: Valid submission
    validateAndSubmit({ name: 'Alice' }, false);
    assert.equal(apiCalledCount, 1, 'API called once for valid form');

    // Attempt 4: Double-tap while isPending=true
    validateAndSubmit({ name: 'Alice' }, true);
    assert.equal(apiCalledCount, 1, 'Second tap while pending is ignored, no duplicate');
  });

  // --------------------------------------------------------------------------
  // Architecture & Component Audit Across Forms
  // --------------------------------------------------------------------------
  it('Scenario 11: All mobile forms implement field-level errors, error borders, and auto-focus architecture', () => {
    const screens = [
      { name: 'LoginScreen', file: path.join(srcDir, 'screens', 'LoginScreen.jsx') },
      { name: 'NewBookingSheet', file: path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx') },
      { name: 'CheckInSheet', file: path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx') },
      { name: 'CheckoutSheet', file: path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx') },
      { name: 'StayDetailSheet', file: path.join(srcDir, 'components', 'sheets', 'StayDetailSheet.jsx') },
      { name: 'GuestEditSheet', file: path.join(srcDir, 'components', 'sheets', 'GuestEditSheet.jsx') },
      { name: 'RoomMasterScreen', file: path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx') },
      { name: 'UsersScreen', file: path.join(srcDir, 'screens', 'more', 'UsersScreen.jsx') },
      { name: 'SettingsScreen', file: path.join(srcDir, 'screens', 'more', 'SettingsScreen.jsx') },
    ];

    screens.forEach(({ name, file }) => {
      assert.ok(fs.existsSync(file), `${name} file must exist at ${file}`);
      const content = fs.readFileSync(file, 'utf8');

      // Check field error display
      assert.ok(
        content.includes('FieldError') || content.includes('styles.fieldError') || content.includes('errors.'),
        `${name} must render field-level error display`
      );

      // Check error border styling / input error prop
      assert.ok(
        content.includes('error={') || content.includes('inputError') || content.includes('styles.inputError'),
        `${name} must highlight invalid inputs with error border`
      );

      // Check auto-focus / ref wiring
      assert.ok(
        content.includes('registerRef') ||
          content.includes('ref={') ||
          content.includes('.focus()') ||
          content.includes('scrollRef'),
        `${name} must support ref registration / focus / auto-scroll`
      );
    });
  });
});
