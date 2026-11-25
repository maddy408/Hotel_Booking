/**
 * Universal Indian Mobile Number Validator & Form Utilities for Frontend
 */

/**
 * Universal Indian Mobile Number Validator:
 * - Checks for valid 10-digit Indian mobile numbers.
 * - Accepts digits only, with optional +91, 91 (12 digits), or 0 (11 digits) prefix.
 * - Disallows letters or invalid special characters.
 * - Requires the 10-digit number to start with 6, 7, 8, or 9 (rejects 1-5 and 0).
 */
export function validatePhone(phone) {
  if (phone === null || phone === undefined) {
    return { isValid: false, error: 'Mobile number is required.', digits: '' };
  }
  const str = String(phone).trim();
  if (str === '') {
    return { isValid: false, error: 'Mobile number is required.', digits: '' };
  }

  // Reject non-numeric characters (permit only digits, spaces, hyphens, and optional leading '+')
  if (/[^\d\s+\-]/.test(str)) {
    return { isValid: false, error: 'Only numeric digits are allowed.', digits: '' };
  }

  let digits = str.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (!/^[6-9]/.test(digits)) {
    return { isValid: false, error: 'Indian mobile numbers must start with 6, 7, 8, or 9.', digits };
  }

  if (digits.length !== 10) {
    return { isValid: false, error: 'Mobile number must be exactly 10 digits.', digits };
  }

  return { isValid: true, error: null, digits };
}

/** Validate 10-digit Indian mobile number starting with 6, 7, 8, or 9 (supports +91 and 0 prefixes). */
export function isValidPhone(phone) {
  return validatePhone(phone).isValid;
}

/** Normalizes phone to standard 10 digits without prefixes. */
export function cleanPhone10(raw) {
  if (!raw) return '';
  let str = String(raw).trim();
  let digits = str.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * Real-time Indian Mobile Number Typing Handler:
 * - Only numeric digits accepted; letters and special characters rejected immediately.
 * - First digit must be 6, 7, 8, or 9.
 * - Rejects 1, 2, 3, 4, 5 (and 0) as the starting digit immediately while typing.
 * - Caps input at 10 digits.
 * - Supports normal backspace and editing without losing middle digits.
 * - Returns { value, error, isValid, rejected }.
 */
export function handlePhoneInputChange(input, prevVal = '') {
  let raw = String(input ?? '');

  // Handle empty input (e.g. user backspaced all)
  if (raw === '') {
    return {
      value: '',
      error: null,
      isValid: false,
    };
  }

  // Reject non-numeric characters immediately while typing
  if (/[^\d\s+\-]/.test(raw)) {
    const safePrev = String(prevVal ?? '').replace(/\D/g, '').slice(0, 10);
    return {
      value: safePrev,
      error: 'Only numeric digits are allowed.',
      isValid: safePrev.length === 10 && /^[6-9]/.test(safePrev),
      rejected: true,
    };
  }

  // Handle pasted country code (+91, 91, or leading 0)
  if (raw.startsWith('+91')) {
    raw = raw.slice(3).trim();
  } else if (raw.startsWith('91') && raw.replace(/\D/g, '').length === 12) {
    raw = raw.slice(2).trim();
  } else if (raw.startsWith('0') && raw.replace(/\D/g, '').length === 11) {
    raw = raw.slice(1).trim();
  }

  const digits = raw.replace(/\D/g, '');

  if (digits === '') {
    return {
      value: '',
      error: null,
      isValid: false,
    };
  }

  const first = digits[0];
  if (!['6', '7', '8', '9'].includes(first)) {
    const safePrev = prevVal && ['6', '7', '8', '9'].includes(String(prevVal)[0])
      ? String(prevVal).replace(/\D/g, '').slice(0, 10)
      : '';
    return {
      value: safePrev,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
      isValid: false,
      rejected: true,
    };
  }

  const value = digits.slice(0, 10);

  if (value.length === 10) {
    return {
      value,
      error: null,
      isValid: true,
    };
  }

  // Valid prefix while typing (1-9 digits)
  return {
    value,
    error: null,
    isValid: false,
  };
}

/**
 * Resolves the actual configured rate from Room Master for a given room.
 * Prioritizes room's own roomType rate, type_rate, rate, or roomTypes list lookup.
 * Does not hardcode rates or use random defaults.
 */
export function getRoomConfiguredRate(room, roomTypes = []) {
  if (!room) return 0;
  if (room.roomType?.rate != null && Number(room.roomType.rate) > 0) {
    return Number(room.roomType.rate);
  }
  if (room.type_rate != null && Number(room.type_rate) > 0) {
    return Number(room.type_rate);
  }
  if (room.rate != null && Number(room.rate) > 0) {
    return Number(room.rate);
  }
  const typeId = room.room_type_id ?? room.roomTypeId ?? room.roomType?.id;
  if (typeId && Array.isArray(roomTypes)) {
    const foundType = roomTypes.find((t) => Number(t.id) === Number(typeId));
    if (foundType?.rate != null && Number(foundType.rate) > 0) {
      return Number(foundType.rate);
    }
  }
  return 0;
}
