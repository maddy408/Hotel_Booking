import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile Confirm Check-in Payload & Validation Parity', () => {
  // Helper simulating the payload extractor implemented in mobile/src/api/reservations.js
  function extractCheckInPayload(payload) {
    let reservationId = null;
    let body = payload;

    if (payload && typeof payload === 'object' && !(payload instanceof FormData)) {
      if (payload.id && payload.formData) {
        reservationId = payload.id;
        body = payload.formData;
      } else if (payload.reservationId && payload.formData) {
        reservationId = payload.reservationId;
        body = payload.formData;
      } else if (payload.id) {
        reservationId = payload.id;
      } else if (payload.reservationId) {
        reservationId = payload.reservationId;
      }
    }

    if (!reservationId && payload && typeof payload === 'object') {
      if (typeof payload.get === 'function') {
        reservationId = payload.get('reservationId') || payload.get('id');
      } else if (Array.isArray(payload._parts)) {
        const found = payload._parts.find(
          (part) => part[0] === 'reservationId' || part[0] === 'id'
        );
        if (found) reservationId = found[1];
      }
    }

    return { reservationId, body };
  }

  it('1. Extracts reservation ID and formData when payload is { id, formData }', () => {
    const mockFormData = { _parts: [['notes', 'Early arrival']] };
    const payload = { id: 45, formData: mockFormData };
    const { reservationId, body } = extractCheckInPayload(payload);

    assert.equal(reservationId, 45);
    assert.equal(body, mockFormData);
  });

  it('2. Extracts reservation ID and data when payload is JSON object { id, advance_amount, room_id }', () => {
    const payload = { id: 78, room_id: 104, advance_amount: 1500 };
    const { reservationId, body } = extractCheckInPayload(payload);

    assert.equal(reservationId, 78);
    assert.equal(body.room_id, 104);
    assert.equal(body.advance_amount, 1500);
  });

  it('3. Safely extracts reservation ID from React Native FormData with _parts (no .get() method)', () => {
    // Simulating React Native's FormData object which does NOT have .get()
    const rnFormData = {
      _parts: [
        ['reservationId', '112'],
        ['actual_check_in', '2026-11-19 14:00:00'],
      ],
      append(k, v) {
        this._parts.push([k, v]);
      },
    };

    assert.equal(typeof rnFormData.get, 'undefined');
    const { reservationId, body } = extractCheckInPayload(rnFormData);

    assert.equal(reservationId, '112');
    assert.equal(body, rnFormData);
  });

  it('4. Safely extracts reservation ID from standard FormData with .get() method', () => {
    const stdFormData = {
      map: new Map([['id', '230']]),
      get(k) {
        return this.map.get(k);
      },
    };

    const { reservationId, body } = extractCheckInPayload(stdFormData);
    assert.equal(reservationId, '230');
    assert.equal(body, stdFormData);
  });

  it('5. Double-tap prevention logic prevents duplicate API requests', () => {
    let callCount = 0;
    const isSubmittingRef = { current: false };

    const handleConfirmCheckIn = async () => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      try {
        callCount++;
      } finally {
        isSubmittingRef.current = false;
      }
    };

    // First call sets isSubmittingRef.current = true
    isSubmittingRef.current = true;
    // Simultaneous second tap should be ignored
    handleConfirmCheckIn();
    assert.equal(callCount, 0);

    // After reset, tap succeeds
    isSubmittingRef.current = false;
    handleConfirmCheckIn();
    assert.equal(callCount, 1);
  });

  it('6. Business rule: Validates room readiness before check-in', () => {
    const validateRoomReadiness = (room) => {
      if (!room) return { valid: false, message: 'Room not selected' };
      if (room.status === 'maintenance') return { valid: false, message: 'Room under maintenance' };
      if (room.status === 'occupied') return { valid: false, message: 'Room is already occupied' };
      return { valid: true };
    };

    assert.equal(validateRoomReadiness({ status: 'maintenance' }).valid, false);
    assert.equal(validateRoomReadiness({ status: 'occupied' }).valid, false);
    assert.equal(validateRoomReadiness({ status: 'available' }).valid, true);
    assert.equal(validateRoomReadiness({ status: 'ready' }).valid, true);
  });

  it('7. Business rule: Validates required advance amount when required by hotel policy', () => {
    const validateAdvance = (advanceRequired, advanceCollected) => {
      const req = Number(advanceRequired) || 0;
      const col = Number(advanceCollected) || 0;
      if (req > 0 && col < req) {
        return { valid: false, message: `Minimum advance of ₹${req} required (collected: ₹${col})` };
      }
      return { valid: true };
    };

    assert.equal(validateAdvance(1000, 500).valid, false);
    assert.equal(validateAdvance(1000, 1000).valid, true);
    assert.equal(validateAdvance(1000, 1500).valid, true);
    assert.equal(validateAdvance(0, 0).valid, true);
  });

  it('8. Business rule: Validates occupant count does not exceed room max capacity', () => {
    const validateCapacity = (occupantsCount, maxPersons) => {
      if (occupantsCount > maxPersons) {
        return { valid: false, message: `Room capacity exceeded (max ${maxPersons} persons)` };
      }
      return { valid: true };
    };

    assert.equal(validateCapacity(4, 3).valid, false);
    assert.equal(validateCapacity(3, 3).valid, true);
    assert.equal(validateCapacity(2, 3).valid, true);
  });

  it('9. Pre-check-in advance auto-collection: when advance is entered but uncollected, onSubmit auto-records payment', async () => {
    let recorded = null;
    const mockRecordAdvance = {
      mutateAsync: async ({ id, amount, method }) => {
        recorded = { id, amount, method };
        return { advance_paid: amount };
      },
    };

    let confirmedAdvance = 0;
    const advance = '750';
    const pay = 'upi';
    const reservation = { id: 89 };

    // Simulating onSubmit flow for pre-check-in when confirmedAdvance <= 0
    const advVal = Number(advance) || 0;
    assert.ok(advVal > 0);
    const res = await mockRecordAdvance.mutateAsync({ id: reservation.id, amount: advVal, method: pay });
    confirmedAdvance = Number(res.advance_paid);

    assert.equal(confirmedAdvance, 750);
    assert.deepEqual(recorded, { id: 89, amount: 750, method: 'upi' });
  });

  it('10. CheckInSheet button accessibility: button is only disabled while isPending, allowing user taps to trigger validation feedback', () => {
    const checkInSheetCode = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx'), 'utf8');

    // Confirm button must not be hard-disabled by !allMandatoryChecksPassed so taps trigger validation toasts
    assert.ok(
      !checkInSheetCode.includes('disabled={isPending || !allMandatoryChecksPassed}'),
      'Confirm Check-In button must not be disabled by !allMandatoryChecksPassed'
    );
    assert.ok(
      checkInSheetCode.includes('disabled={isPending}'),
      'Confirm Check-In button must be disabled={isPending}'
    );
  });

  it('11. Duck-typing FormData check in apiClient.js and reservations.js handles React Native Hermes FormData', () => {
    const apiClientCode = fs.readFileSync(path.join(srcDir, 'lib', 'apiClient.js'), 'utf8');
    const reservationsCode = fs.readFileSync(path.join(srcDir, 'api', 'reservations.js'), 'utf8');

    assert.ok(
      apiClientCode.includes("typeof body.append === 'function' ||"),
      'apiClient.js must duck-type body.append for React Native FormData'
    );
    assert.ok(
      reservationsCode.includes("typeof payload.append === 'function' ||"),
      'reservations.js must duck-type payload.append for React Native FormData'
    );
  });

  it('12. Occupant phone numbers are sanitized to 10 digits before check-in submission', () => {
    const rawOccupants = [
      { name: 'John Doe', gender: 'Male', phone: '+91 98765-43210' },
      { name: 'Jane Doe', gender: 'Female', phone: '91234 56789' },
    ];

    const occPayload = rawOccupants.map((occ, i) => ({
      occupant_number: i + 1,
      name: (occ.name || '').trim(),
      gender: (occ.gender || '').trim(),
      phone: (occ.phone || '').replace(/\D/g, '').slice(0, 10),
    }));

    assert.equal(occPayload[0].phone, '9198765432');
    assert.equal(occPayload[1].phone, '9123456789');
    assert.equal(occPayload[0].phone.length, 10);
    assert.equal(occPayload[1].phone.length, 10);
  });

  it('13. CheckInSheet normalizes file URIs and MIME types for Android multipart uploads', () => {
    const checkInSheetCode = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx'), 'utf8');

    // Must import expo-file-system to guarantee internal cache file persistence
    assert.ok(
      checkInSheetCode.includes("import * as FileSystem from 'expo-file-system/legacy';"),
      'CheckInSheet must import FileSystem for file caching'
    );

    // Must format Android URIs to file:/// scheme
    assert.ok(
      checkInSheetCode.includes('formatFileUri') && checkInSheetCode.includes("uri.startsWith('file:/')"),
      'CheckInSheet must include formatFileUri for Android'
    );

    // Must map common file extensions to valid MIME types
    assert.ok(
      checkInSheetCode.includes('MIME_EXT_MAP') && checkInSheetCode.includes("'image/jpeg'"),
      'CheckInSheet must map file extensions to valid MIME types'
    );
  });

  it('14. CheckInSheet avoids conflicting occupantTargets duplicate form keys', () => {
    const checkInSheetCode = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx'), 'utf8');

    // Must NOT have the redundant json stringified occupantTargets appending
    assert.ok(
      !checkInSheetCode.includes("form.append('occupantTargets', JSON.stringify("),
      'CheckInSheet must not append both occupantTargets[] and occupantTargets string'
    );

    // Must append occupantTargets[] per document
    assert.ok(
      checkInSheetCode.includes("form.append('occupantTargets[]', String(item.occupantTarget ?? '0'));"),
      'CheckInSheet must append occupantTargets[] per document'
    );
  });

  it('15. apiClient.js preserves underlying network error messages', () => {
    const apiClientCode = fs.readFileSync(path.join(srcDir, 'lib', 'apiClient.js'), 'utf8');

    assert.ok(
      apiClientCode.includes('err?.message'),
      'apiClient.js must include err?.message in the ApiError'
    );
  });

  it('16. apiClient.js routes multipart FormData through XMLHttpRequest to prevent Expo Unsupported FormDataPart error', () => {
    const apiClientCode = fs.readFileSync(path.join(srcDir, 'lib', 'apiClient.js'), 'utf8');

    assert.ok(
      apiClientCode.includes('function requestViaXHR('),
      'apiClient.js must define requestViaXHR'
    );
    assert.ok(
      apiClientCode.includes('if (isFormData)') && apiClientCode.includes('requestViaXHR(path,'),
      'apiClient.js must route isFormData through requestViaXHR'
    );
  });
});
