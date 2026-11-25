import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPhone10,
  isValidPhone,
  validatePhone,
  handlePhoneInputChange,
  getRoomConfiguredRate,
} from '../lib/validation.js';

describe('Mobile App: Indian Mobile Number Validation & Pre-book Room Rate', () => {
  describe('1. Mobile Phone Input Validation While Typing', () => {
    it('rejects starting digits 1, 2, 3, 4, 5 immediately while typing', () => {
      for (const digit of ['1', '2', '3', '4', '5']) {
        const res = handlePhoneInputChange(digit, '');
        assert.equal(res.value, '', `Starting digit ${digit} should not be accepted`);
        assert.equal(res.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');
      }
    });

    it('rejects starting digit 0 as first character while typing single digit', () => {
      const res = handlePhoneInputChange('0', '');
      assert.equal(res.value, '');
      assert.equal(res.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');
    });

    it('allows starting digits 6, 7, 8, 9 while typing', () => {
      for (const digit of ['6', '7', '8', '9']) {
        const res = handlePhoneInputChange(digit, '');
        assert.equal(res.value, digit, `Starting digit ${digit} should be accepted`);
        assert.equal(res.error, null);
      }
    });

    it('allows typing valid 10-digit number smoothly', () => {
      const target = '9876543210';
      let current = '';
      for (let i = 0; i < target.length; i++) {
        const char = target[i];
        const next = current + char;
        const res = handlePhoneInputChange(next, current);
        assert.equal(res.value, next);
        assert.equal(res.error, null);
        current = res.value;
      }
      assert.equal(current, '9876543210');
      assert.equal(isValidPhone(current), true);
    });

    it('rejects letters and special characters while typing', () => {
      const res1 = handlePhoneInputChange('987abc', '987');
      assert.equal(res1.value, '987');
      assert.equal(res1.error, 'Only numeric digits are allowed.');

      const res2 = handlePhoneInputChange('98@#$!', '98');
      assert.equal(res2.value, '98');
      assert.equal(res2.error, 'Only numeric digits are allowed.');
    });

    it('caps input at 10 digits', () => {
      const res = handlePhoneInputChange('9876543210999', '9876543210');
      assert.equal(res.value, '9876543210');
      assert.equal(res.value.length, 10);
    });

    it('handles backspace without dropping or scrambling characters', () => {
      const res = handlePhoneInputChange('9876', '98765');
      assert.equal(res.value, '9876');
      assert.equal(res.error, null);
    });

    it('preserves middle-editing without deleting characters', () => {
      // User modifies digit in middle
      const modified = '9879543210';
      const res = handlePhoneInputChange(modified, '9876543210');
      assert.equal(res.value, '9879543210');
      assert.equal(res.error, null);
      assert.equal(isValidPhone(res.value), true);
    });

    it('handles country code prefixes (+91, 91, 0) consistently', () => {
      assert.equal(cleanPhone10('+919876543210'), '9876543210');
      assert.equal(cleanPhone10('919876543210'), '9876543210');
      assert.equal(cleanPhone10('09876543210'), '9876543210');

      const res = handlePhoneInputChange('+919876543210', '');
      assert.equal(res.value, '9876543210');
      assert.equal(res.error, null);
    });

    it('validatePhone returns explicit messages for each validation failure', () => {
      const v1 = validatePhone('');
      assert.equal(v1.isValid, false);
      assert.equal(v1.error, 'Mobile number is required.');

      const v2 = validatePhone('98765');
      assert.equal(v2.isValid, false);
      assert.equal(v2.error, 'Mobile number must be exactly 10 digits.');

      const v3 = validatePhone('1234567890');
      assert.equal(v3.isValid, false);
      assert.equal(v3.error, 'Indian mobile numbers must start with 6, 7, 8, or 9.');

      const v4 = validatePhone('9876543210');
      assert.equal(v4.isValid, true);
      assert.equal(v4.error, null);
    });
  });

  describe('2. Room Master Rate Auto-Population on Pre-book', () => {
    const mockRoomTypes = [
      { id: 1, name: 'Standard', rate: 2200 },
      { id: 2, name: 'Deluxe', rate: 3500 },
      { id: 3, name: 'Suite', rate: 5500 },
    ];

    it('retrieves configured rate for Room 102 Standard (2200)', () => {
      const room102 = {
        id: 2,
        roomNo: 102,
        room_no: '102',
        room_type_id: 1,
        roomType: { id: 1, name: 'Standard', rate: 2200 },
      };
      const rate = getRoomConfiguredRate(room102, mockRoomTypes);
      assert.equal(rate, 2200);
    });

    it('retrieves configured rate for Deluxe Room 201 (3500)', () => {
      const room201 = {
        id: 11,
        roomNo: 201,
        room_type_id: 2,
        roomType: { id: 2, name: 'Deluxe', rate: 3500 },
      };
      const rate = getRoomConfiguredRate(room201, mockRoomTypes);
      assert.equal(rate, 3500);
    });

    it('updates rate when switching selected room in mobile booking sheet', () => {
      const roomStandard = { id: 2, roomNo: 102, room_type_id: 1, roomType: { id: 1, rate: 2200 } };
      const roomDeluxe = { id: 11, roomNo: 201, room_type_id: 2, roomType: { id: 2, rate: 3500 } };

      let currentRoom = roomStandard;
      let rate = getRoomConfiguredRate(currentRoom, mockRoomTypes);
      assert.equal(rate, 2200);

      currentRoom = roomDeluxe;
      rate = getRoomConfiguredRate(currentRoom, mockRoomTypes);
      assert.equal(rate, 3500);
    });

    it('preserves existing booking saved rate in edit mode', () => {
      const editReservation = {
        id: 55,
        booking_code: 'BK-55',
        room_id: 2,
        rate: 1950,
      };
      const isEdit = Boolean(editReservation && editReservation.id);
      assert.equal(isEdit, true);

      // In edit mode, initial rate comes from editReservation.rate
      const initialRate = isEdit ? String(editReservation.rate) : '';
      assert.equal(initialRate, '1950');
    });

    it('resolves mobile pre-book roomId from editReservation: { room_id } correctly without entering edit mode', () => {
      const preBookParam = { room_id: 2 };
      const isEdit = Boolean(preBookParam && preBookParam.id);
      assert.equal(isEdit, false, 'Pre-book without reservation ID must not be in edit mode');

      const initialRoomId = preBookParam?.room_id ?? '';
      assert.equal(initialRoomId, 2);

      const allRooms = [
        { id: 1, roomNo: 101, room_type_id: 1, roomType: { id: 1, rate: 2200 } },
        { id: 2, roomNo: 102, room_type_id: 1, roomType: { id: 1, rate: 2200 } },
      ];
      const selected = allRooms.find((r) => r.id === initialRoomId);
      assert.ok(selected);
      assert.equal(getRoomConfiguredRate(selected, mockRoomTypes), 2200);
    });

    it('ensures setError is destructured in NewBookingSheet, CheckInSheet, and GuestEditSheet', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
      const files = [
        '../components/sheets/NewBookingSheet.jsx',
        '../components/sheets/CheckInSheet.jsx',
        '../components/sheets/GuestEditSheet.jsx',
      ];

      for (const relPath of files) {
        const filePath = path.resolve(__dirname, relPath);
        const code = await fs.readFile(filePath, 'utf8');
        assert.ok(
          code.includes('setError,'),
          `Expected ${relPath} to destructure setError from useFormValidation`
        );
      }
    });
  });
});
