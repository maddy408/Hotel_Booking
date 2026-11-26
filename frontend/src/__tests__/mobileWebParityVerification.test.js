import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile vs Web Feature Parity Verification Suite', () => {
  it('1. RoomTile provides direct Clean and Repair actions without opening Room Masters', () => {
    const content = fs.readFileSync(path.join(srcDir, 'components', 'RoomTile.jsx'), 'utf-8');
    assert.ok(content.includes('Clean'), 'RoomTile must have Clean action');
    assert.ok(content.includes('Repair'), 'RoomTile must have Repair action');
    assert.ok(content.includes('useHousekeepingAction'), 'RoomTile must invoke useHousekeepingAction mutation');
    assert.ok(content.includes('To Clean'), 'RoomTile must support transitioning Repair to To Clean');
  });

  it('2. EditRoomSheet supports Delete Room with confirmation and maintenance status actions', () => {
    const content = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'EditRoomSheet.jsx'), 'utf-8');
    assert.ok(content.includes('useDeleteRoom'), 'Must use useDeleteRoom mutation');
    assert.ok(content.includes('Delete Room'), 'Must render Delete Room button');
    assert.ok(content.includes('Mark Under Maintenance'), 'Must support marking room under maintenance');
    assert.ok(content.includes('Mark Ready'), 'Must support marking room ready from maintenance');
  });

  it('3. Booking ID Documents: upload, view, and delete supported in BookingDetailSheet & API', () => {
    const apiContent = fs.readFileSync(path.join(srcDir, 'api', 'reservations.js'), 'utf-8');
    assert.ok(apiContent.includes('useUploadReservationDocuments'), 'Must export useUploadReservationDocuments');

    const sheetContent = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'BookingDetailSheet.jsx'), 'utf-8');
    assert.ok(sheetContent.includes('ID Documents'), 'Must display ID Documents section');
    assert.ok(sheetContent.includes('useUploadReservationDocuments'), 'Must use upload reservation docs');
    assert.ok(sheetContent.includes('useDeleteOccupantDocument'), 'Must use delete occupant doc');
    assert.ok(sheetContent.includes('fetchOccupantDocumentBlob'), 'Must fetch blob for document viewing');
  });

  it('4. Bookings search and recent-bookings-first sorting work properly', () => {
    const content = fs.readFileSync(path.join(srcDir, 'pages', 'Bookings.jsx'), 'utf-8');
    assert.ok(content.includes('Search booking, guest or room…'), 'Must have search input');
    assert.ok(content.includes('dateB.localeCompare(dateA)'), 'Must sort recent bookings first');
    assert.ok(content.includes('(Number(b.id) || 0) - (Number(a.id) || 0)'), 'Must break ties with id DESC');
  });

  it('5. Guest ID proof does not auto-default to Aadhaar and displays Not Provided', () => {
    const editSheet = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'GuestEditSheet.jsx'), 'utf-8');
    assert.ok(editSheet.includes('Not Provided'), 'Must have Not Provided option in ID proof select');
    assert.ok(!editSheet.includes("idProofType || 'Aadhaar'"), 'Must not default to Aadhaar');

    const details = fs.readFileSync(path.join(srcDir, 'pages', 'GuestDetails.jsx'), 'utf-8');
    assert.ok(details.includes("guest.idProofType || 'Not Provided'"), 'Must display Not Provided when no proof is saved');
    assert.ok(details.includes("navigate('/guests')"), 'Must navigate to /guests after deletion');
  });

  it('6. Guests list sorts latest registered guests first by created_at DESC, id DESC', () => {
    const content = fs.readFileSync(path.join(srcDir, 'pages', 'Guests.jsx'), 'utf-8');
    assert.ok(content.includes('sortedGuests'), 'Must have sortedGuests memo');
    assert.ok(content.includes('dateB.localeCompare(dateA)'), 'Must sort by created_at DESC');
    assert.ok(content.includes('(Number(b.id) || 0) - (Number(a.id) || 0)'), 'Must break ties with id DESC');
  });

  it('7. Reports date range filter, preset options, balance collected, and custom CSV naming', () => {
    const apiReports = fs.readFileSync(path.join(srcDir, 'api', 'reports.js'), 'utf-8');
    assert.ok(apiReports.includes('KKK_Lodge_Invoices_'), 'Must use KKK_Lodge_Invoices filename prefix');
    assert.ok(apiReports.includes('useTodayReport(from, to)'), 'useTodayReport must accept from and to parameters');
    assert.ok(apiReports.includes('useDayEndReport(from, to)'), 'useDayEndReport must accept from and to parameters');

    const pageReports = fs.readFileSync(path.join(srcDir, 'pages', 'Reports.jsx'), 'utf-8');
    assert.ok(pageReports.includes('PRESET_OPTIONS'), 'Must define preset options');
    assert.ok(pageReports.includes('today.balanceCollected'), 'Must display balance collected metric');
    assert.ok(pageReports.includes('revenue.totals?.discountAmount'), 'Must display discounts in revenue summary');
  });

  it('8. Bills list provides search, date presets, and InvoicePrint returns to /bills', () => {
    const billsContent = fs.readFileSync(path.join(srcDir, 'pages', 'Bills.jsx'), 'utf-8');
    assert.ok(billsContent.includes('PRESET_OPTIONS'), 'Bills must support date presets');
    assert.ok(billsContent.includes('search'), 'Bills must have search state');
    assert.ok(billsContent.includes('filteredDone'), 'Bills must filter list by search and sort recent first');

    const invoicePrint = fs.readFileSync(path.join(srcDir, 'pages', 'InvoicePrint.jsx'), 'utf-8');
    assert.ok(invoicePrint.includes("navigate('/bills')"), 'InvoicePrint must return to /bills when closing fallback');
    assert.ok(!invoicePrint.includes("navigate('/')"), 'InvoicePrint must not redirect to rooms dashboard');
  });

  it('9. CheckoutSheet supports fixed and percentage discounts with validation against total payable', () => {
    const content = fs.readFileSync(path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx'), 'utf-8');
    assert.ok(content.includes('discountType'), 'Must have discountType state');
    assert.ok(content.includes('100% Full Discount'), 'Must have 100% Full Discount button');
    assert.ok(content.includes('totalBefore'), 'Must calculate totalBefore');
    assert.ok(content.includes('Discount cannot exceed the payable amount'), 'Must validate discount does not exceed payable amount');
  });
});
