import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsPath = path.resolve(__dirname, '..', 'screens', 'more', 'SettingsScreen.jsx');

describe('Mobile Settings Screen: Phone Number & Email Address Validation', () => {
  const content = fs.readFileSync(settingsPath, 'utf8');

  // Extract functions directly from source file
  const phoneFnCode = content.match(/function validatePhoneNumber\([\s\S]*?\n\}/)[0];
  const emailFnCode = content.match(/function validateEmailAddress\([\s\S]*?\n\}/)[0];
  const validatePhoneNumber = new Function(phoneFnCode + '; return validatePhoneNumber;')();
  const validateEmailAddress = new Function(emailFnCode + '; return validateEmailAddress;')();

  describe('1. Mobile Phone Number Validation', () => {
    it('accepts valid 10-digit Indian mobile numbers starting with 6, 7, 8, or 9', () => {
      const validNumbers = [
        '9876543210',
        '8765432109',
        '7654321098',
        '6543210987',
        '9989015824',
        '9123456789',
      ];
      for (const phone of validNumbers) {
        assert.equal(validatePhoneNumber(phone), null, `Expected ${phone} to be valid`);
      }
    });

    it('accepts valid Indian mobile numbers with +91 prefix (with or without spaces/hyphens)', () => {
      const validWithPrefix = [
        '+919876543210',
        '+91 9876543210',
        '+91-9876543210',
        '+91 9989015824',
      ];
      for (const phone of validWithPrefix) {
        assert.equal(validatePhoneNumber(phone), null, `Expected ${phone} to be valid`);
      }
    });

    it('rejects letters and alphanumeric strings with clear error message', () => {
      const invalidWithLetters = [
        '98765abcde',
        'abcdefghij',
        '987654321a',
        'phone12345',
      ];
      for (const phone of invalidWithLetters) {
        const err = validatePhoneNumber(phone);
        assert.ok(err, `Expected ${phone} to be rejected`);
        assert.equal(err, 'Only numeric digits are allowed.');
      }
    });

    it('rejects special characters with clear error message', () => {
      const invalidWithSpecialChars = [
        '9876@#$%10',
        '98765!2345',
        '98765#4321',
        '(987)65432',
      ];
      for (const phone of invalidWithSpecialChars) {
        const err = validatePhoneNumber(phone);
        assert.ok(err, `Expected ${phone} to be rejected`);
        assert.equal(err, 'Only numeric digits are allowed.');
      }
    });

    it('rejects invalid lengths (too short or too long)', () => {
      // Too short
      assert.equal(validatePhoneNumber('98765'), 'Mobile number must be exactly 10 digits.');
      assert.equal(validatePhoneNumber('987654321'), 'Mobile number must be exactly 10 digits.');

      // Too long
      assert.equal(validatePhoneNumber('98765432101'), 'Mobile number must be exactly 10 digits.');
      assert.equal(validatePhoneNumber('9876543210999'), 'Mobile number must be exactly 10 digits.');
    });

    it('rejects numbers not starting with 6, 7, 8, or 9', () => {
      const invalidStarters = [
        '1234567890',
        '2345678901',
        '3456789012',
        '4567890123',
        '5678901234',
        '0123456789',
      ];
      for (const phone of invalidStarters) {
        assert.equal(
          validatePhoneNumber(phone),
          'Indian mobile numbers must start with 6, 7, 8, or 9.',
          `Expected ${phone} to be rejected for invalid first digit`
        );
      }
    });

    it('rejects empty or blank phone number', () => {
      assert.equal(validatePhoneNumber(''), 'Phone number is required.');
      assert.equal(validatePhoneNumber('   '), 'Phone number is required.');
      assert.equal(validatePhoneNumber(null), 'Phone number is required.');
      assert.equal(validatePhoneNumber(undefined), 'Phone number is required.');
    });
  });

  describe('2. Mobile Email Address Validation', () => {
    it('accepts valid email addresses in proper format', () => {
      const validEmails = [
        'user@example.com',
        'hotel.frontdesk@example.com',
        'admin@sub.domain.org',
        'contact@kkklodge.in',
        'info+support@hotel.co.in',
      ];
      for (const email of validEmails) {
        assert.equal(validateEmailAddress(email), null, `Expected ${email} to be valid`);
      }
    });

    it('rejects emails containing spaces', () => {
      const emailsWithSpaces = [
        'user @example.com',
        'user@ example.com',
        'user@example .com',
        'user name@example.com',
      ];
      for (const email of emailsWithSpaces) {
        assert.equal(
          validateEmailAddress(email),
          'Email address cannot contain spaces.',
          `Expected ${email} to be rejected for spaces`
        );
      }
    });

    it('rejects emails with missing or incomplete domain names', () => {
      const missingDomain = [
        'user@',
        'user@example',
        'user@.com',
        'user@domain.',
      ];
      for (const email of missingDomain) {
        const err = validateEmailAddress(email);
        assert.ok(err, `Expected ${email} to be rejected`);
        assert.ok(
          err.includes('domain') || err.includes('valid email address'),
          `Unexpected error for ${email}: ${err}`
        );
      }
    });

    it('rejects invalid email formats', () => {
      const invalidFormats = [
        'plainaddress',
        '@missinguser.com',
        'user@@example.com',
        'user@example..com',
        'user@example.c',
      ];
      for (const email of invalidFormats) {
        const err = validateEmailAddress(email);
        assert.ok(err, `Expected ${email} to be rejected`);
      }
    });

    it('rejects empty or blank email address', () => {
      assert.equal(validateEmailAddress(''), 'Email address is required.');
      assert.equal(validateEmailAddress('   '), 'Email address is required.');
      assert.equal(validateEmailAddress(null), 'Email address is required.');
      assert.equal(validateEmailAddress(undefined), 'Email address is required.');
    });
  });

  describe('3. Mobile Save Behaviour, Inline Feedback, and UI Structure', () => {
    it('SettingsScreen renders inline FieldError components with error children', () => {
      assert.ok(content.includes('<FieldError error={errors.hotelPhone}>{errors.hotelPhone}</FieldError>'), 'Must render phone FieldError with text child');
      assert.ok(content.includes('<FieldError error={errors.hotelEmail}>{errors.hotelEmail}</FieldError>'), 'Must render email FieldError with text child');
    });

    it('SettingsScreen binds error prop to Input components', () => {
      assert.ok(content.includes('error={Boolean(errors.hotelPhone)}'), 'Must pass error bool to phone Input');
      assert.ok(content.includes('error={Boolean(errors.hotelEmail)}'), 'Must pass error bool to email Input');
    });

    it('SettingsScreen validates on blur for both phone and email', () => {
      assert.ok(content.includes('validatePhoneNumber(hotel.phone)'), 'Must validate phone onBlur or validate');
      assert.ok(content.includes('validateEmailAddress(hotel.email)'), 'Must validate email onBlur or validate');
    });

    it('SettingsScreen validates on Save and prevents submission when invalid', () => {
      assert.ok(content.includes('hotelPhone: () => validatePhoneNumber(hotel.phone)'), 'save handler must validate phone');
      assert.ok(content.includes('hotelEmail: () => validateEmailAddress(hotel.email)'), 'save handler must validate email');
      assert.ok(content.includes('if (!isValid) return;'), 'save handler must abort when invalid');
    });

    it('SettingsScreen removes validation errors immediately when the user corrects input', () => {
      assert.ok(content.includes('clearError(\'hotelPhone\')'), 'Phone error must be cleared on valid input');
      assert.ok(content.includes('clearError(\'hotelEmail\')'), 'Email error must be cleared on valid input');
    });
  });
});
