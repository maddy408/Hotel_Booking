import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Verification of 6 Tamarind Court UI & Functionality Fixes', () => {

  // ---------------------------------------------------------------------------
  // Issue 1: Room Dashboard – Direct Clean & Repair Options
  // ---------------------------------------------------------------------------
  describe('Issue 1: Room Dashboard – Direct Clean & Repair Options', () => {
    const tilePath = path.join(srcDir, 'components', 'RoomTile.jsx');
    const content = fs.readFileSync(tilePath, 'utf8');

    it('imports useHousekeepingAction and Alert for direct room status updates', () => {
      assert.ok(content.includes('useHousekeepingAction'), 'Must import useHousekeepingAction');
      assert.ok(content.includes('Alert'), 'Must import Alert for confirmation');
    });

    it('provides Clean and Repair actions for free/ready rooms', () => {
      assert.ok(content.includes("room.status === 'free'"), 'Must handle free/ready rooms');
      assert.ok(content.includes("title: 'Clean'") || content.includes("title: 'Clean'"), 'Must have Clean action');
      assert.ok(content.includes("title: 'Repair'"), 'Must have Repair action');
      assert.ok(content.includes("action: 'cleaning'"), 'Clean action must target cleaning');
      assert.ok(content.includes("action: 'repair'"), 'Repair action must target repair');
    });

    it('provides Ready and Repair actions for cleaning rooms', () => {
      assert.ok(content.includes("room.status === 'cleaning'"), 'Must handle cleaning rooms');
      assert.ok(content.includes("title: 'Ready'"), 'Must have Ready action');
      assert.ok(content.includes("action: 'ready'"), 'Ready action must target ready');
    });

    it('strictly preserves status rules: repair rooms have To Clean, NEVER direct Ready', () => {
      assert.ok(content.includes("room.status === 'repair'"), 'Must handle repair rooms');
      assert.ok(content.includes("title: 'To Clean'"), 'Repair room must have To Clean action');
      // Ensure repair block does NOT contain ready action
      const repairBlockMatch = content.match(/else\s+if\s*\(\s*room\.status\s*===\s*'repair'\s*\)\s*\{([\s\S]*?)\}/);
      assert.ok(repairBlockMatch, 'Must find repair block');
      assert.ok(!repairBlockMatch[1].includes("action: 'ready'"), 'Repair room must NOT have direct ready action');
    });

    it('requires user confirmation via Alert.alert before updating status', () => {
      assert.ok(content.includes('Alert.alert'), 'Must call Alert.alert for confirmation');
      assert.ok(content.includes('Confirm'), 'Alert must include Confirm button');
      assert.ok(content.includes('Cancel'), 'Alert must include Cancel button');
    });

    it('invokes hkAction.mutateAsync on confirm to refresh room cards immediately', () => {
      assert.ok(content.includes('hkAction.mutateAsync'), 'Must execute housekeeping mutation');
    });
  });

  // ---------------------------------------------------------------------------
  // Issue 2: Checkout – Discount Incorrectly Included in Revenue
  // ---------------------------------------------------------------------------
  describe('Issue 2: Checkout – Discount Reactivity & Revenue Calculation', () => {
    const checkoutSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
    const invoiceHtmlPath = path.join(srcDir, 'lib', 'invoiceHtml.js');
    const repoPath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Repository', 'ReportRepository.php');
    const invoicePrintWebPath = path.resolve(srcDir, '..', '..', 'frontend', 'src', 'pages', 'InvoicePrint.jsx');

    it('CheckoutSheet imports and uses useEarlyCheckoutPreview for reactive bill recalculation', () => {
      const content = fs.readFileSync(checkoutSheetPath, 'utf8');
      assert.ok(content.includes('useEarlyCheckoutPreview'), 'Must import useEarlyCheckoutPreview');
      assert.ok(content.includes('previewData?.bill || rawBill'), 'Must compute dynamic bill from preview');
      assert.ok(content.includes('discount: effectiveDiscount'), 'Must pass discount to preview query');
    });

    it('CheckoutSheet ensures amount is zero when bill is fully discounted', () => {
      const content = fs.readFileSync(checkoutSheetPath, 'utf8');
      assert.ok(content.includes('bal > 0 ? bal : 0'), 'Payment amount must be 0 when bal <= 0');
    });

    it('ReportRepository revenueTotals excludes discounts from room revenue and zero-tax invoices', () => {
      const content = fs.readFileSync(repoPath, 'utf8');
      assert.ok(content.includes('room_amount > discount_amount THEN room_amount - discount_amount') || content.includes('GREATEST(0, room_amount - discount_amount)'), 'Must subtract discount from room amount');
      assert.ok(content.includes('CASE WHEN total_amount = 0 THEN 0'), 'Must exclude tax when total amount is 0');
    });

    it('Mobile invoiceHtml renders discount applied row before Invoice Total', () => {
      const content = fs.readFileSync(invoiceHtmlPath, 'utf8');
      assert.ok(content.includes('invoice.discount_amount') && content.includes('Discount applied'), 'Invoice HTML must render Discount applied row');
    });

    it('Web InvoicePrint renders discount applied row before Invoice total', () => {
      const content = fs.readFileSync(invoicePrintWebPath, 'utf8');
      assert.ok(content.includes('invoice.discount_amount') && content.includes('Discount applied'), 'Web invoice must render Discount applied row');
    });
  });

  // ---------------------------------------------------------------------------
  // Issue 3: Upload Document Text Overflow
  // ---------------------------------------------------------------------------
  describe('Issue 3: Upload Document Text Overflow', () => {
    it('GuestDetailsScreen wraps staged document buttons to prevent overflow', () => {
      const guestPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
      const content = fs.readFileSync(guestPath, 'utf8');
      const matches = content.match(/flexDirection:\s*'row',\s*flexWrap:\s*'wrap',\s*gap:\s*8,\s*marginTop:\s*8/g);
      assert.ok(matches && matches.length >= 2, 'Both staged document button rows must have flexWrap: wrap');
    });

    it('StayDetailSheet wraps Occupants & ID Documents row responsively', () => {
      const staySheetPath = path.join(srcDir, 'components', 'sheets', 'StayDetailSheet.jsx');
      const content = fs.readFileSync(staySheetPath, 'utf8');
      assert.ok(content.includes("styles.infoRow, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }"), 'Must wrap infoRow');
      assert.ok(content.includes("styles.cardTitle, { flexShrink: 1"), 'cardTitle must have flexShrink: 1');
    });

    it('CheckoutSheet wraps ID Proof Documents header row responsively', () => {
      const checkoutSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
      const content = fs.readFileSync(checkoutSheetPath, 'utf8');
      assert.ok(content.includes("styles.rowBetween, { flexWrap: 'wrap', gap: 6 }"), 'Must wrap rowBetween');
      assert.ok(content.includes("styles.label, { flexShrink: 1 }"), 'label must have flexShrink: 1');
    });

    it('BookingDetailSheet wraps ID Documents header row responsively', () => {
      const bookingSheetPath = path.join(srcDir, 'components', 'sheets', 'BookingDetailSheet.jsx');
      const content = fs.readFileSync(bookingSheetPath, 'utf8');
      assert.ok(content.includes("styles.rowBetween, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }"), 'Must wrap rowBetween');
      assert.ok(content.includes("styles.cardTitle, { flexShrink: 1"), 'cardTitle must have flexShrink: 1');
    });

    it('CheckInSheet ID document labels support text wrapping without overflow', () => {
      const checkInPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');
      const content = fs.readFileSync(checkInPath, 'utf8');
      assert.ok(content.includes("chooseFileTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, flexShrink: 1, flexWrap: 'wrap' }"), 'chooseFileTitle must allow wrap');
      assert.ok(content.includes("docMissing: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.danger, flexShrink: 1, flexWrap: 'wrap' }"), 'docMissing must allow wrap');
    });
  });

  // ---------------------------------------------------------------------------
  // Issue 4: Room Masters – Add Room / Add Room Type Text Overflow
  // ---------------------------------------------------------------------------
  describe('Issue 4: Room Masters – Add Room / Add Room Type Text Overflow', () => {
    const roomMasterPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
    const content = fs.readFileSync(roomMasterPath, 'utf8');

    it('styles.header uses flexWrap: wrap and gap: 8 to ensure responsive layout', () => {
      assert.ok(content.includes("header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }"), 'Header must wrap with gap');
    });

    it('wraps title and subtitle in flex: 1, minWidth: 150 container for both tabs', () => {
      const matches = content.match(/flex:\s*1,\s*minWidth:\s*150,\s*marginRight:\s*8/g);
      assert.ok(matches && matches.length >= 2, 'Both Floors & Rooms and Room Types tabs must constrain title container');
    });

    it('both action buttons "+ Add Rooms / Floor" and "+ Add Type" are preserved', () => {
      assert.ok(content.includes('title="+ Add Rooms / Floor"'), 'Must preserve "+ Add Rooms / Floor"');
      assert.ok(content.includes('title="+ Add Type"'), 'Must preserve "+ Add Type"');
    });
  });

  // ---------------------------------------------------------------------------
  // Issue 5: Maintenance Status Hidden on Mobile
  // ---------------------------------------------------------------------------
  describe('Issue 5: Maintenance Status Visible on Mobile Cards', () => {
    const tilePath = path.join(srcDir, 'components', 'RoomTile.jsx');
    const content = fs.readFileSync(tilePath, 'utf8');

    it('uses in-flow topRow with space-between instead of absolute positioned chip', () => {
      assert.ok(!content.includes("statusChip: { position: 'absolute'"), 'statusChip must NOT be position: absolute');
      assert.ok(content.includes("justifyContent: 'space-between'"), 'topRow must separate identity and badge');
    });

    it('statusChip has flexShrink: 0 and compact padding for readability', () => {
      assert.ok(content.includes('flexShrink: 0'), 'statusChip must have flexShrink: 0 to never be squished');
    });

    it('displays compact labels for all statuses: READY, BOOKED, OCCUPIED, CLEANING, REPAIR', () => {
      assert.ok(content.includes("free: 'READY'"), 'Free maps to READY');
      assert.ok(content.includes("booked: 'BOOKED'"), 'Booked maps to BOOKED');
      assert.ok(content.includes("occupied: 'OCCUPIED'"), 'Occupied maps to OCCUPIED');
      assert.ok(content.includes("cleaning: 'CLEANING'"), 'Cleaning maps to CLEANING');
      assert.ok(content.includes("repair: 'REPAIR'"), 'Repair maps to REPAIR');
    });

    it('displays Under maintenance meta text when room is in repair status', () => {
      assert.ok(content.includes("Under maintenance"), 'Meta must display Under maintenance for repair rooms');
    });
  });

  // ---------------------------------------------------------------------------
  // Issue 6: Export CSV – Automatic Download & Excel Date Formatting
  // ---------------------------------------------------------------------------
  describe('Issue 6: Export CSV – Automatic Download & Excel Date Formatting', () => {
    const reportsApiPath = path.join(srcDir, 'api', 'reports.js');
    const reportsScreenPath = path.join(srcDir, 'screens', 'more', 'ReportsScreen.jsx');
    const backendServicePath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Service', 'ReportService.php');

    it('backend ReportService formats invoice dates as YYYY-MM-DD for Excel compatibility', () => {
      const content = fs.readFileSync(backendServicePath, 'utf8');
      assert.ok(content.includes("date('Y-m-d', strtotime("), 'Must format created_at as Y-m-d');
    });

    it('mobile reports.js caches granted SAF directory in AsyncStorage to avoid repeated folder picker', () => {
      const content = fs.readFileSync(reportsApiPath, 'utf8');
      assert.ok(content.includes('AsyncStorage'), 'Must import AsyncStorage');
      assert.ok(content.includes('tc_saf_downloads_uri'), 'Must use dedicated key tc_saf_downloads_uri');
      assert.ok(content.includes('AsyncStorage.getItem(SAF_DOWNLOADS_KEY)'), 'Must check cached directory URI first');
      assert.ok(content.includes('AsyncStorage.setItem(SAF_DOWNLOADS_KEY'), 'Must save granted directory URI to cache');
    });

    it('mobile ReportsScreen provides both Open File and Share File options on export completion', () => {
      const content = fs.readFileSync(reportsScreenPath, 'utf8');
      assert.ok(content.includes('Sharing.shareAsync'), 'Must support sharing file');
      assert.ok(content.includes('Open File'), 'Must provide Open File option');
      assert.ok(content.includes('Share File'), 'Must provide Share File option');
    });
  });
});
