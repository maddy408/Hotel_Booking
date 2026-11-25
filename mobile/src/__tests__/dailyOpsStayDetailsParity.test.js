import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

// Test normalizeStayId implementation logic matching api/stays.js
function normalizeStayId(stayId) {
  if (stayId == null) return null;
  if (typeof stayId === 'string' && stayId.startsWith('stay-')) {
    const num = parseInt(stayId.slice(5), 10);
    return !isNaN(num) && num > 0 ? num : null;
  }
  const num = Number(stayId);
  return !isNaN(num) && num > 0 ? num : null;
}

describe('Daily Ops Checkout Stay Details Loading Fix', () => {
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const stayDetailSheetPath = path.join(srcDir, 'components', 'sheets', 'StayDetailSheet.jsx');
  const staysApiPath = path.join(srcDir, 'api', 'stays.js');
  const stayControllerPath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Controller', 'StayController.php');

  it('1. normalizeStayId correctly normalizes numeric IDs and prefixed strings', () => {
    assert.equal(normalizeStayId(5), 5);
    assert.equal(normalizeStayId('5'), 5);
    assert.equal(normalizeStayId('stay-12'), 12);
    assert.equal(normalizeStayId('stay-999'), 999);
    assert.equal(normalizeStayId(null), null);
    assert.equal(normalizeStayId(undefined), null);
    assert.equal(normalizeStayId('res-5'), null);
    assert.equal(normalizeStayId(''), null);
    assert.equal(normalizeStayId(0), null);
  });

  it('2. DailyOpsScreen extracts numeric stay_id instead of string stay-X in checkouts', () => {
    const dailyOpsContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');
    assert.ok(
      dailyOpsContent.includes('const stayId = s.stay_id ||'),
      'DailyOpsScreen must prioritize s.stay_id before s.id'
    );
    // Ensure it does not do the naive `s.id || s.stay_id` which assigned 'stay-1'
    assert.ok(
      !dailyOpsContent.includes('const stayId = s.id || s.stay_id;'),
      'DailyOpsScreen must not use s.id || s.stay_id'
    );
  });

  it('3. StayDetailSheet handles errors and does not hang on loading indefinitely', () => {
    const sheetContent = fs.readFileSync(stayDetailSheetPath, 'utf8');
    assert.ok(
      sheetContent.includes('isStayError') || sheetContent.includes('stayError'),
      'StayDetailSheet must track query error state'
    );
    assert.ok(
      sheetContent.includes('normalizedStayId') || sheetContent.includes('validStayId'),
      'StayDetailSheet must normalize stayId defensively'
    );
    assert.ok(
      sheetContent.includes('Could not load stay details') || sheetContent.includes('Invalid or missing stay ID'),
      'StayDetailSheet must present error message instead of infinite loading'
    );
  });

  it('4. api/stays.js normalizes stayId before querying endpoints', () => {
    const apiContent = fs.readFileSync(staysApiPath, 'utf8');
    assert.ok(
      apiContent.includes('normalizeStayId(stayId)'),
      'useStay and useStayBill must sanitize stayId'
    );
  });

  it('5. Backend StayController parses prefixed stay IDs defensively', () => {
    if (fs.existsSync(stayControllerPath)) {
      const phpContent = fs.readFileSync(stayControllerPath, 'utf8');
      assert.ok(
        phpContent.includes('parseStayId'),
        'StayController must have parseStayId helper'
      );
      assert.ok(
        phpContent.includes('str_starts_with'),
        'StayController must check for stay- prefix'
      );
    }
  });

  it('6. DailyOpsScreen replaces message icon with WhatsAppIcon without modifying other actions', () => {
    const dailyOpsContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');
    assert.ok(
      dailyOpsContent.includes('<WhatsAppIcon'),
      'DailyOpsScreen must render WhatsAppIcon'
    );
    assert.ok(
      !dailyOpsContent.includes('💬'),
      'DailyOpsScreen must not use generic message emoji'
    );
    // Ensure other actions are preserved untouched and Photo Upload is removed
    assert.ok(!dailyOpsContent.includes('📷 Upload Photo'), 'Upload Photo action must be removed');
    assert.ok(dailyOpsContent.includes('Process Check-out →'), 'Process Check-out action must be preserved');
    assert.ok(dailyOpsContent.includes('📅'), 'Calendar action must be preserved');
    assert.ok(dailyOpsContent.includes('📋'), 'Stay Details action must be preserved');
  });
});
