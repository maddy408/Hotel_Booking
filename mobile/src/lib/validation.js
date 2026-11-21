import { useCallback, useRef, useState } from 'react';

/**
 * Universal Mobile Form Validation & Error Handling Engine
 *
 * Implements:
 * 1. Field-level error state management and auto-clearing on edit.
 * 2. Pre-submission validation of required fields, formats, numbers, dates.
 * 3. Auto-scroll to the first invalid field in ScrollView / KeyboardAwareScrollView.
 * 4. Automatic focusing and keyboard opening for editable inputs.
 * 5. Backend validation error mapping (translates PHP backend error keys to form fields).
 * 6. Form-level error banner for unmapped / general errors.
 */

/** Check if value is present and non-empty (allows 0). */
export function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !isNaN(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Validate 10-digit Indian mobile number starting with 6, 7, 8, or 9 (supports +91 and 0 prefixes). */
export function isValidPhone(phone) {
  if (!phone) return false;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return /^[6-9]\d{9}$/.test(digits);
}

/** Validate standard email format. */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Validate positive numeric value (rate, amount, etc.). */
export function isValidPositiveNumber(val, { allowZero = false, min = 0, max = Infinity, integer = false } = {}) {
  if (val === null || val === undefined || val === '') return false;
  const num = Number(val);
  if (isNaN(num)) return false;
  if (integer && !Number.isInteger(num)) return false;
  if (!allowZero && num <= 0) return false;
  if (num < min || num > max) return false;
  return true;
}

/** Validate date string (YYYY-MM-DD). */
export function isValidDate(val) {
  if (!val || typeof val !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [y, m, d] = val.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Common field aliases between backend PHP and mobile form state.
 */
export const BACKEND_FIELD_MAP = {
  // Guest / Name
  guest_name: 'name',
  guestName: 'name',
  name: 'name',
  occupant_name: 'name',

  // Phone / Mobile
  guest_phone: 'phone',
  guestPhone: 'phone',
  mobile_number: 'phone',
  mobileNumber: 'phone',
  mobile: 'phone',
  phone: 'phone',

  // Room
  room_id: 'roomId',
  roomId: 'roomId',
  room_no: 'roomNo',
  roomNo: 'roomNo',
  room: 'room',

  // Dates
  check_in_date: 'checkIn',
  checkIn: 'checkIn',
  check_in: 'checkIn',
  check_out_date: 'checkOut',
  checkOut: 'checkOut',
  check_out: 'checkOut',
  checkout_planned: 'checkOut',
  checkoutPlanned: 'checkOut',

  // Occupancy & Tariffs
  persons: 'persons',
  days: 'days',
  rate: 'rate',
  amount: 'amount',
  advance_amount: 'advance',
  advanceAmount: 'advance',
  advance_paid: 'advance',
  advance_method: 'pay',
  advanceMethod: 'pay',

  // Source & Referrals
  booking_source: 'bookingSource',
  bookingSource: 'bookingSource',
  referred_by_guest_id: 'referredByGuestId',
  referredByGuestId: 'referredByGuestId',
  other_source: 'otherSource',
  otherSource: 'otherSource',

  // ID Proofs
  id_proof_type: 'idType',
  idProofType: 'idType',
  id_proof_number: 'idNo',
  idProofNumber: 'idNo',

  // Users & Auth
  username: 'username',
  password: 'password',
  role: 'role',
  email: 'email',

  // Settings
  hotel_name: 'hotelName',
  hotelName: 'hotelName',
  hotel_phone: 'hotelPhone',
  hotelPhone: 'hotelPhone',
  hotel_email: 'hotelEmail',
  hotelEmail: 'hotelEmail',
  checkout_hour: 'checkoutHour',
  checkoutHour: 'checkoutHour',
  gst_slab1_max_rate: 'gstSlab1MaxRate',
  gstSlab1MaxRate: 'gstSlab1MaxRate',
  gst_slab1_gst_rate: 'gstSlab1GstRate',
  gstSlab1GstRate: 'gstSlab1GstRate',
  gst_slab2_gst_rate: 'gstSlab2GstRate',
  gstSlab2GstRate: 'gstSlab2GstRate',
  cancellation_refund_percentage: 'cancellationRefundPercentage',
  cancellationRefundPercentage: 'cancellationRefundPercentage',
  free_cancellation_hours: 'freeCancellationHours',
  freeCancellationHours: 'freeCancellationHours',

  // Room Master
  floor: 'floor',
  from: 'from',
  to: 'to',
  max_persons: 'maxPersons',
  maxPersons: 'maxPersons',
  room_type_id: 'typeId',
  roomTypeId: 'typeId',
};

/** User-friendly default messages for required fields. */
export const FRIENDLY_FIELD_MESSAGES = {
  name: 'Guest name is required.',
  phone: 'Mobile number is required.',
  roomId: 'Please select a room.',
  room: 'Please select a room.',
  checkIn: 'Check-in date is required.',
  checkOut: 'Checkout date is required.',
  rate: 'Please enter a valid daily rate.',
  advance: 'Please enter a valid payment amount.',
  amount: 'Please enter a valid payment amount.',
  username: 'Username is required.',
  password: 'Password is required.',
  role: 'Please select a role.',
  floor: 'Floor number is required.',
  from: 'Starting room number is required.',
  typeId: 'Please select a room type.',
  referredByGuestId: 'Please select an existing member as reference.',
  otherSource: 'Please enter person name for reference.',
};

/**
 * Maps raw backend error payload to frontend field errors and optional form-level error.
 */
export function mapBackendValidationErrors(err, arg2 = {}, arg3 = {}) {
  let fieldOrder = [];
  let customMapping = {};
  if (Array.isArray(arg2)) {
    fieldOrder = arg2;
    customMapping = arg3 || {};
  } else {
    customMapping = arg2 || {};
  }

  const fieldErrors = {};
  let formError = '';
  let unmapped = '';

  if (!err) return { fieldErrors, formError, unmapped, firstInvalidField: null };

  const rawFields = err.fields || err.data?.error?.fields || (typeof err.code === 'string' && err.fields) || null;
  const mergedMap = { ...BACKEND_FIELD_MAP, ...customMapping };

  if (rawFields && typeof rawFields === 'object' && Object.keys(rawFields).length > 0) {
    for (const [key, msg] of Object.entries(rawFields)) {
      const mappedKey = mergedMap[key];
      let friendlyMsg = String(msg || '');

      // Normalize generic "This field is required." messages into specific messages
      if (friendlyMsg.toLowerCase() === 'this field is required.' && FRIENDLY_FIELD_MESSAGES[mappedKey || key]) {
        friendlyMsg = FRIENDLY_FIELD_MESSAGES[mappedKey || key];
      }

      if (mappedKey) {
        fieldErrors[mappedKey] = friendlyMsg;
      } else {
        // Unmapped backend error
        fieldErrors[key] = friendlyMsg;
        unmapped = unmapped ? `${unmapped} · ${friendlyMsg}` : friendlyMsg;
      }
    }
  }

  // If no fields were mapped, or there's an overarching message that shouldn't be lost
  if (Object.keys(fieldErrors).length === 0) {
    formError = err.message || 'Validation failed. Please check the form and try again.';
    unmapped = formError;
  }

  let firstInvalidField = null;
  if (fieldOrder && fieldOrder.length > 0) {
    firstInvalidField = fieldOrder.find((k) => Boolean(fieldErrors[k])) || null;
  }
  if (!firstInvalidField) {
    firstInvalidField = Object.keys(fieldErrors)[0] || null;
  }

  return {
    fieldErrors,
    formError: formError || unmapped,
    unmapped: formError || unmapped,
    firstInvalidField,
  };
}

/**
 * Primary React hook for managing form validation, scroll-to-first-error, and input focus.
 *
 * @param {Object|string[]} options Options object or array of fieldOrder keys
 * @param {React.RefObject} [options.scrollRef] Ref to the enclosing ScrollView / Screen / Sheet
 * @param {string[]} [options.fieldOrder] Array of field keys in top-to-bottom visual order
 * @param {Object} [options.customMapping] Custom field name mappings for backend errors
 */
export function useFormValidation(options = {}) {
  let scrollRef;
  let fieldOrder = [];
  let customMapping = {};

  if (Array.isArray(options)) {
    fieldOrder = options;
  } else if (options && typeof options === 'object') {
    scrollRef = options.scrollRef;
    fieldOrder = options.fieldOrder || [];
    customMapping = options.customMapping || {};
  }

  const internalScrollRef = useRef(null);
  const activeScrollRef = scrollRef || internalScrollRef;

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  // Storage for element references and layout coordinates
  const inputRefs = useRef({});
  const containerRefs = useRef({});
  const fieldOffsets = useRef({});

  /** Register an input element ref (for calling .focus()) */
  const registerInput = useCallback((key) => {
    return (el) => {
      if (el) {
        inputRefs.current[key] = el;
      } else {
        delete inputRefs.current[key];
      }
    };
  }, []);

  /** Register a container element ref (for measureLayout) */
  const registerContainer = useCallback((key) => {
    return (el) => {
      if (el) {
        containerRefs.current[key] = el;
      } else {
        delete containerRefs.current[key];
      }
    };
  }, []);

  /** Register onLayout callback to capture relative Y position */
  const registerLayout = useCallback((key) => {
    return (event) => {
      if (event?.nativeEvent?.layout) {
        fieldOffsets.current[key] = event.nativeEvent.layout.y;
      }
    };
  }, []);

  /** Register helper that returns all necessary registration props for an input/container */
  const registerField = useCallback((key) => {
    return {
      inputRef: registerInput(key),
      containerRef: registerContainer(key),
      onLayout: registerLayout(key),
      error: errors[key],
    };
  }, [registerInput, registerContainer, registerLayout, errors]);

  /** Set an individual field error */
  const setError = useCallback((key, message) => {
    setErrors((prev) => ({ ...prev, [key]: message }));
  }, []);

  /** Clear an individual field error when user corrects it */
  const clearError = useCallback((key) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError('');
  }, []);

  /** Clear all current errors */
  const clearAllErrors = useCallback(() => {
    setErrors({});
    setFormError('');
  }, []);

  /**
   * Automatically scroll the ScrollView to the first invalid field and focus it.
   *
   * @param {Object} [errorsToCheck] Errors object (defaults to current errors state)
   * @param {string[]} [customOrder] Custom field order override
   * @returns {string|null} The key of the first invalid field, or null if none
   */
  const scrollToFirstError = useCallback((errorsToCheck, customOrder) => {
    const errs = errorsToCheck || errors;
    const invalidKeys = Object.keys(errs).filter((k) => Boolean(errs[k]));
    if (invalidKeys.length === 0) return null;

    const order = customOrder || fieldOrder;
    let firstInvalidKey = null;

    if (order && order.length > 0) {
      firstInvalidKey = order.find((k) => Boolean(errs[k]));
    }
    if (!firstInvalidKey) {
      firstInvalidKey = invalidKeys[0];
    }

    const scrollNode = activeScrollRef?.current;
    const containerNode = containerRefs.current[firstInvalidKey];
    const inputNode = inputRefs.current[firstInvalidKey];
    const recordedY = fieldOffsets.current[firstInvalidKey];

    // Navigate to the target position
    const performScroll = (targetY) => {
      if (scrollNode && typeof scrollNode.scrollTo === 'function') {
        scrollNode.scrollTo({
          y: Math.max(0, targetY - 24),
          animated: true,
        });
      }
    };

    if (scrollNode && containerNode && typeof containerNode.measureLayout === 'function') {
      try {
        containerNode.measureLayout(
          scrollNode,
          (left, top) => performScroll(top),
          () => {
            if (typeof recordedY === 'number') performScroll(recordedY);
          }
        );
      } catch {
        if (typeof recordedY === 'number') performScroll(recordedY);
      }
    } else if (scrollNode && inputNode && typeof inputNode.measureLayout === 'function') {
      try {
        inputNode.measureLayout(
          scrollNode,
          (left, top) => performScroll(top),
          () => {
            if (typeof recordedY === 'number') performScroll(recordedY);
          }
        );
      } catch {
        if (typeof recordedY === 'number') performScroll(recordedY);
      }
    } else if (typeof recordedY === 'number') {
      performScroll(recordedY);
    }

    // Open keyboard and focus input after scroll initiates
    if (inputNode && typeof inputNode.focus === 'function') {
      setTimeout(() => {
        try {
          inputNode.focus();
        } catch {}
      }, 75);
    }

    return firstInvalidKey;
  }, [errors, fieldOrder, activeScrollRef]);

  /**
   * Handle backend error: maps field errors, updates state, and navigates to the first error.
   */
  const handleBackendError = useCallback((err, customMap) => {
    const { fieldErrors, formError: generalError, unmapped, firstInvalidField } = mapBackendValidationErrors(
      err,
      fieldOrder,
      { ...customMapping, ...customMap }
    );

    setErrors(fieldErrors);
    if (generalError) {
      setFormError(generalError);
    }

    if (Object.keys(fieldErrors).length > 0) {
      scrollToFirstError(fieldErrors);
      return { fieldErrors, unmapped: generalError || unmapped, firstInvalidField };
    }

    // If only general form error, scroll to top
    if (activeScrollRef?.current && typeof activeScrollRef.current.scrollTo === 'function') {
      activeScrollRef.current.scrollTo({ y: 0, animated: true });
    }
    return { fieldErrors, unmapped: generalError || unmapped, firstInvalidField: null };
  }, [customMapping, fieldOrder, scrollToFirstError, activeScrollRef]);

  /**
   * Validate fields using a validator function or an object of validation rules.
   * If errors exist, automatically sets them and scrolls to the first invalid field.
   *
   * @param {Function|Object} rulesOrValidatorFn Function returning errors OR object of field validator functions
   * @returns {boolean} True if completely valid, false if invalid
   */
  const validate = useCallback((rulesOrValidatorFn) => {
    let validationErrors = {};
    if (typeof rulesOrValidatorFn === 'function') {
      validationErrors = rulesOrValidatorFn() || {};
    } else if (rulesOrValidatorFn && typeof rulesOrValidatorFn === 'object') {
      for (const [key, rule] of Object.entries(rulesOrValidatorFn)) {
        if (typeof rule === 'function') {
          const msg = rule();
          if (msg) validationErrors[key] = msg;
        } else if (rule) {
          validationErrors[key] = String(rule);
        }
      }
    }

    const hasErrors = Object.values(validationErrors).some(Boolean);

    if (hasErrors) {
      setErrors(validationErrors);
      setFormError('');
      scrollToFirstError(validationErrors);
      return false;
    }

    setErrors({});
    setFormError('');
    return true;
  }, [scrollToFirstError]);

  return {
    errors,
    formError,
    unmappedError: formError,
    setErrors,
    setError,
    clearError,
    clearAllErrors,
    setFormError,
    registerInput,
    registerRef: registerInput,
    registerContainer,
    registerLayout,
    registerField,
    inputRefs,
    containerRefs,
    fieldOffsets,
    scrollToFirstError,
    handleBackendError,
    setBackendErrors: handleBackendError,
    validate,
    scrollRef: activeScrollRef,
  };
}
