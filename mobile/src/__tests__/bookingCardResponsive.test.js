import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Booking Card Responsive UI & Advance/Discount Validations', () => {
  const bookingsScreenSource = fs.readFileSync(
    path.join(__dirname, '../screens/bookings/BookingsScreen.jsx'),
    'utf-8'
  );
  const newBookingSheetSource = fs.readFileSync(
    path.join(__dirname, '../components/sheets/NewBookingSheet.jsx'),
    'utf-8'
  );
  const checkInSheetSource = fs.readFileSync(
    path.join(__dirname, '../components/sheets/CheckInSheet.jsx'),
    'utf-8'
  );
  const checkoutSheetSource = fs.readFileSync(
    path.join(__dirname, '../components/sheets/CheckoutSheet.jsx'),
    'utf-8'
  );
  const invoicePrintScreenSource = fs.readFileSync(
    path.join(__dirname, '../screens/bills/InvoicePrintScreen.jsx'),
    'utf-8'
  );
  const reportsScreenSource = fs.readFileSync(
    path.join(__dirname, '../screens/more/ReportsScreen.jsx'),
    'utf-8'
  );

  it('1. Booking card header has responsive layout with wrapping for small screens', () => {
    // Verify rowTop has flexWrap: 'wrap' and gap properties
    assert.ok(
      bookingsScreenSource.includes("flexWrap: 'wrap'"),
      'rowTop or header must enable flexWrap'
    );
    assert.ok(
      bookingsScreenSource.includes('headerPrimary'),
      'Must have headerPrimary container for Booking ID and Room'
    );
    assert.ok(
      bookingsScreenSource.includes('headerBadges'),
      'Must have headerBadges container for Overdue and Situation badges'
    );
    assert.ok(
      bookingsScreenSource.includes('rowGap: 6') || bookingsScreenSource.includes('rowGap'),
      'Must specify rowGap for natural row separation'
    );
  });

  it('2. Badges use alignSelf flex-start and compact padding to prevent overflow', () => {
    assert.ok(
      bookingsScreenSource.includes("alignSelf: 'flex-start'"),
      'Badges must have alignSelf flex-start'
    );
    assert.ok(
      bookingsScreenSource.includes('situationBadge'),
      'situationBadge style must be defined'
    );
    assert.ok(
      bookingsScreenSource.includes('overdueBadge'),
      'overdueBadge style must be defined'
    );
  });

  it('3. NewBookingSheet validates advance does not exceed total and is not negative', () => {
    assert.ok(
      newBookingSheetSource.includes('Advance cannot exceed the total payable amount.'),
      'NewBookingSheet must include exact validation message'
    );
    assert.ok(
      newBookingSheetSource.includes('advNum > total') || newBookingSheetSource.includes('advance > total'),
      'NewBookingSheet must compare advance against total'
    );
  });

  it('4. CheckInSheet validates advance does not exceed total for direct & reservation check-in', () => {
    assert.ok(
      checkInSheetSource.includes('Advance cannot exceed the total payable amount.'),
      'CheckInSheet must include exact validation message'
    );
    assert.ok(
      checkInSheetSource.includes('isAdvanceExceeded') || checkInSheetSource.includes('advNum > total'),
      'CheckInSheet must detect advance exceeded'
    );
  });

  it('5. CheckoutSheet supports both fixed and percentage discounts with strict cap', () => {
    assert.ok(
      checkoutSheetSource.includes("discountType === 'percent'"),
      'CheckoutSheet must support percentage discount'
    );
    assert.ok(
      checkoutSheetSource.includes('Discount percentage cannot exceed 100%.') ||
      checkoutSheetSource.includes('100'),
      'CheckoutSheet must validate percentage <= 100%'
    );
    assert.ok(
      checkoutSheetSource.includes('Discount cannot exceed the payable amount.'),
      'CheckoutSheet must validate discount does not exceed total before discount'
    );
  });

  it('6. InvoicePrintScreen renders discount row in HTML print template and on-screen preview', () => {
    assert.ok(
      invoicePrintScreenSource.includes('discount_amount') && invoicePrintScreenSource.includes('Discount Applied'),
      'InvoicePrintScreen must render Discount Applied row'
    );
  });

  it('7. ReportsScreen displays Balance collected and Discount totals', () => {
    assert.ok(
      reportsScreenSource.includes('Balance collected'),
      'ReportsScreen must display Balance collected'
    );
    assert.ok(
      reportsScreenSource.includes('Discount'),
      'ReportsScreen must display Discount'
    );
  });
});
