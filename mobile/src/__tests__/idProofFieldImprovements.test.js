import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getIdProofConfig,
  handleIdNumberInputChange,
  validateIdNumber,
  ID_PROOF_TYPES,
} from '../lib/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('ID Proof & Number Field Improvements (Mobile)', () => {
  describe('1. Aadhaar Numeric Keyboard & Exact 12 Digits Rule', () => {
    it('provides keyboardType="numeric" and maxLength 12 for Aadhaar on mobile', () => {
      const config = getIdProofConfig('Aadhaar');
      assert.equal(config.type, 'Aadhaar');
      assert.equal(config.keyboardType, 'numeric');
      assert.equal(config.maxLength, 12);
      assert.equal(config.autoCapitalize, 'none');
    });

    it('rejects letters and special characters immediately while typing Aadhaar', () => {
      const res = handleIdNumberInputChange('1234abcd!@#5678', 'Aadhaar');
      assert.equal(res.value, '12345678');
      assert.equal(res.isValid, false);
    });

    it('caps Aadhaar digits at exactly 12 when typing or pasting', () => {
      const res = handleIdNumberInputChange('1234567890123456789', 'Aadhaar');
      assert.equal(res.value, '123456789012');
      assert.equal(res.isValid, true);
    });

    it('validates incomplete Aadhaar number with proper error message', () => {
      const val = validateIdNumber('12345678901', 'Aadhaar');
      assert.equal(val.isValid, false);
      assert.equal(val.error, 'Aadhaar number must be exactly 12 digits.');
    });

    it('validates valid 12-digit Aadhaar number', () => {
      const val = validateIdNumber('123456789012', 'Aadhaar');
      assert.equal(val.isValid, true);
      assert.equal(val.error, null);
    });
  });

  describe('2. Alphanumeric Input for Driving Licence, Voter ID, and Passport', () => {
    it('provides default keyboard and autoCapitalize="characters" for DL, Voter ID, and Passport', () => {
      for (const type of ['Driving Licence', 'Voter ID', 'Passport']) {
        const config = getIdProofConfig(type);
        assert.equal(config.keyboardType, 'default');
        assert.equal(config.autoCapitalize, 'characters');
      }
    });

    it('allows valid alphanumeric characters for Driving Licence and accepts spaces/hyphens', () => {
      const res = handleIdNumberInputChange('dl-14 20110012345', 'Driving Licence');
      assert.equal(res.value, 'DL-14 20110012345');
      assert.equal(res.isValid, true);
    });

    it('allows alphanumeric characters for Voter ID and strips invalid characters', () => {
      const res = handleIdNumberInputChange('abc1234567', 'Voter ID');
      assert.equal(res.value, 'ABC1234567');
      assert.equal(res.isValid, true);
    });

    it('allows alphanumeric characters for Passport and strips invalid characters', () => {
      const res = handleIdNumberInputChange('a1234567', 'Passport');
      assert.equal(res.value, 'A1234567');
      assert.equal(res.isValid, true);
    });
  });

  describe('3. Dynamic Labels & Placeholders', () => {
    it('returns custom labels and placeholders for each ID Proof type', () => {
      const aadhaar = getIdProofConfig('Aadhaar');
      assert.equal(aadhaar.label, 'Aadhaar Number');
      assert.equal(aadhaar.placeholder, 'Enter 12-digit Aadhaar number');

      const dl = getIdProofConfig('Driving Licence');
      assert.equal(dl.label, 'Driving Licence Number');
      assert.equal(dl.placeholder, 'e.g. MH0220110012345');

      const voter = getIdProofConfig('Voter ID');
      assert.equal(voter.label, 'Voter ID Number');
      assert.equal(voter.placeholder, 'e.g. ABC1234567');

      const passport = getIdProofConfig('Passport');
      assert.equal(passport.label, 'Passport Number');
      assert.equal(passport.placeholder, 'e.g. A1234567');
    });
  });

  describe('4. Automatic Uppercasing of Alphabetic Characters', () => {
    it('automatically uppercases lowercase letters typed in DL, Voter ID, and Passport', () => {
      assert.equal(handleIdNumberInputChange('mh02dl1234', 'Driving Licence').value, 'MH02DL1234');
      assert.equal(handleIdNumberInputChange('xyz1234567', 'Voter ID').value, 'XYZ1234567');
      assert.equal(handleIdNumberInputChange('j9876543', 'Passport').value, 'J9876543');
    });
  });

  describe('5. Validation Messages for Invalid or Incomplete Numbers', () => {
    it('shows required error message when field is empty and not optional', () => {
      assert.equal(validateIdNumber('', 'Aadhaar').error, 'Enter aadhaar number.');
      assert.equal(validateIdNumber('', 'Driving Licence').error, 'Enter driving licence number.');
      assert.equal(validateIdNumber('', 'Voter ID').error, 'Enter voter id number.');
      assert.equal(validateIdNumber('', 'Passport').error, 'Enter passport number.');
    });

    it('allows blank field when isOptional is true', () => {
      assert.equal(validateIdNumber('', 'Aadhaar', { isOptional: true }).isValid, true);
      assert.equal(validateIdNumber('', 'Passport', { isOptional: true }).isValid, true);
    });

    it('rejects incomplete Driving Licence numbers under 10 characters', () => {
      const val = validateIdNumber('DL123', 'Driving Licence');
      assert.equal(val.isValid, false);
      assert.equal(val.error, 'Driving licence number must be at least 10 characters.');
    });

    it('rejects incomplete Voter ID under 10 characters', () => {
      const val = validateIdNumber('ABC123', 'Voter ID');
      assert.equal(val.isValid, false);
      assert.equal(val.error, 'Voter ID must be at least 10 characters (e.g. ABC1234567).');
    });

    it('rejects passport number not starting with a letter', () => {
      const val = validateIdNumber('12345678', 'Passport');
      assert.equal(val.isValid, false);
      assert.equal(val.error, 'Passport number must start with a letter (e.g. A1234567).');
    });

    it('rejects passport number that is too short (< 6 characters)', () => {
      const val = validateIdNumber('A123', 'Passport');
      assert.equal(val.isValid, false);
      assert.equal(val.error, 'Passport number must be between 6 and 9 alphanumeric characters.');
    });

    it('accepts valid 8-character Indian passport number', () => {
      const val = validateIdNumber('A1234567', 'Passport');
      assert.equal(val.isValid, true);
      assert.equal(val.error, null);
    });
  });

  describe('6. Component Implementation Verifications (Mobile)', () => {
    it('CheckInSheet implements dynamic label, clear on change, keyboardType, and validation', () => {
      const checkInFile = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx'), 'utf8');
      assert.ok(checkInFile.includes('getIdProofConfig'), 'CheckInSheet must import getIdProofConfig');
      assert.ok(checkInFile.includes('handleIdNumberInputChange'), 'CheckInSheet must import handleIdNumberInputChange');
      assert.ok(checkInFile.includes('validateIdNumber'), 'CheckInSheet must import validateIdNumber');
      assert.ok(checkInFile.includes("setIdNo('')"), 'CheckInSheet must clear idNo when idType changes');
      assert.ok(checkInFile.includes('idConfig.label'), 'CheckInSheet must use dynamic idConfig.label');
      assert.ok(checkInFile.includes('idConfig.placeholder'), 'CheckInSheet must use dynamic idConfig.placeholder');
      assert.ok(checkInFile.includes('idConfig.keyboardType'), 'CheckInSheet must set dynamic keyboardType');
      assert.ok(checkInFile.includes('idConfig.autoCapitalize'), 'CheckInSheet must set autoCapitalize');
    });

    it('GuestEditSheet implements dynamic label, clear on change, keyboardType, and validation', () => {
      const editFile = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'GuestEditSheet.jsx'), 'utf8');
      assert.ok(editFile.includes('getIdProofConfig'), 'GuestEditSheet must import getIdProofConfig');
      assert.ok(editFile.includes('handleIdNumberInputChange'), 'GuestEditSheet must import handleIdNumberInputChange');
      assert.ok(editFile.includes('validateIdNumber'), 'GuestEditSheet must import validateIdNumber');
      assert.ok(editFile.includes("setIdProofNumber('')"), 'GuestEditSheet must clear idProofNumber when idProofType changes');
      assert.ok(editFile.includes('idConfig.label'), 'GuestEditSheet must use dynamic idConfig.label');
      assert.ok(editFile.includes('idConfig.placeholder'), 'GuestEditSheet must use dynamic idConfig.placeholder');
      assert.ok(editFile.includes('idConfig.keyboardType'), 'GuestEditSheet must set dynamic keyboardType');
      assert.ok(editFile.includes('idConfig.autoCapitalize'), 'GuestEditSheet must set autoCapitalize');
    });
  });
});
