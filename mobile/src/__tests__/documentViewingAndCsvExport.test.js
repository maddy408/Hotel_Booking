import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Issue 1: Export CSV – Download Instead of Share', () => {
  const reportsApiPath = path.resolve(__dirname, '..', 'api', 'reports.js');
  const reportsScreenPath = path.resolve(__dirname, '..', 'screens', 'more', 'ReportsScreen.jsx');

  const reportsApiContent = fs.readFileSync(reportsApiPath, 'utf8');
  const reportsScreenContent = fs.readFileSync(reportsScreenPath, 'utf8');

  it('1. reports.js does NOT import or use expo-sharing for CSV export', () => {
    assert.ok(
      !reportsApiContent.includes("from 'expo-sharing'") &&
      !reportsApiContent.includes('from "expo-sharing"') &&
      !reportsApiContent.includes('Sharing.shareAsync'),
      'reports.js must not import or use expo-sharing / Sharing.shareAsync'
    );
  });

  it('2. downloadInvoicesCsv uses StorageAccessFramework on Android to save to Downloads', () => {
    assert.ok(
      reportsApiContent.includes('StorageAccessFramework'),
      'reports.js must use StorageAccessFramework for Android storage'
    );
    assert.ok(
      reportsApiContent.includes("getUriForDirectoryInRoot('Download')") ||
      reportsApiContent.includes('getUriForDirectoryInRoot("Download")'),
      'reports.js must target the Download folder with getUriForDirectoryInRoot'
    );
    assert.ok(
      reportsApiContent.includes('requestDirectoryPermissionsAsync'),
      'reports.js must request directory permissions via SAF'
    );
    assert.ok(
      reportsApiContent.includes('createFileAsync'),
      'reports.js must create file in the permitted directory via createFileAsync'
    );
    assert.ok(
      reportsApiContent.includes('writeAsStringAsync'),
      'reports.js must write file contents via writeAsStringAsync'
    );
  });

  it('3. Uses meaningful filename with hotel prefix and dates (KKK_Lodge_Invoices_...)', () => {
    assert.ok(
      reportsApiContent.includes('KKK_Lodge_Invoices_'),
      'Filename must have meaningful hotel prefix KKK_Lodge_Invoices_'
    );
    // Preserves query parameters from and to
    assert.ok(
      reportsApiContent.includes('${BASE_URL}/reports/invoices.csv?from=${from}&to=${to}'),
      'reports.js must preserve API endpoint and query parameters'
    );
  });

  it('4. Provides openDownloadedCsv function to open downloaded CSV in native viewer without sharing', () => {
    assert.ok(
      reportsApiContent.includes('export async function openDownloadedCsv'),
      'reports.js must export openDownloadedCsv helper'
    );
    assert.ok(
      reportsApiContent.includes("mimeType: 'text/csv'") ||
      reportsApiContent.includes('mimeType: "text/csv"'),
      'openDownloadedCsv must use text/csv mimeType'
    );
    assert.ok(
      reportsApiContent.includes('File.preview'),
      'openDownloadedCsv must use File.preview'
    );
  });

  it('5. ReportsScreen prevents duplicate downloads from rapid repeated taps', () => {
    assert.ok(
      reportsScreenContent.includes('if (exporting) return'),
      'exportCsv handler must guard against duplicate calls when exporting is active'
    );
    assert.ok(
      reportsScreenContent.includes('disabled={exporting}'),
      'Export CSV button must be disabled while exporting'
    );
  });

  it('6. ReportsScreen shows success message and provides option to open downloaded file after saving', () => {
    assert.ok(
      reportsScreenContent.includes('Alert.alert('),
      'ReportsScreen must present Alert after saving'
    );
    assert.ok(
      reportsScreenContent.includes('Open File'),
      'Alert must contain an "Open File" option'
    );
    assert.ok(
      reportsScreenContent.includes('openDownloadedCsv'),
      'ReportsScreen must call openDownloadedCsv when Open File is selected'
    );
  });

  it('7. Handles storage permissions and file writing errors gracefully', () => {
    assert.ok(
      reportsApiContent.includes('Storage permission not granted. Download cancelled.'),
      'reports.js must check permissions.granted and throw clear error if denied'
    );
    assert.ok(
      reportsScreenContent.includes('catch (err)'),
      'ReportsScreen must catch file download and saving errors'
    );
  });
});

describe('Issue 2: View in Documents – Open and Display Instead of Share', () => {
  const occupantDocsPath = path.resolve(__dirname, '..', 'api', 'occupantDocuments.js');
  const docViewerSheetPath = path.resolve(__dirname, '..', 'components', 'sheets', 'DocumentViewerSheet.jsx');
  const guestDetailsPath = path.resolve(__dirname, '..', 'screens', 'guests', 'GuestDetailsScreen.jsx');
  const roomDetailsSheetPath = path.resolve(__dirname, '..', 'components', 'sheets', 'RoomDetailsSheet.jsx');
  const stayDetailSheetPath = path.resolve(__dirname, '..', 'components', 'sheets', 'StayDetailSheet.jsx');
  const checkoutSheetPath = path.resolve(__dirname, '..', 'components', 'sheets', 'CheckoutSheet.jsx');
  const invoicePrintPath = path.resolve(__dirname, '..', 'screens', 'bills', 'InvoicePrintScreen.jsx');

  const occupantDocsContent = fs.readFileSync(occupantDocsPath, 'utf8');
  const docViewerSheetContent = fs.readFileSync(docViewerSheetPath, 'utf8');
  const guestDetailsContent = fs.readFileSync(guestDetailsPath, 'utf8');
  const roomDetailsContent = fs.readFileSync(roomDetailsSheetPath, 'utf8');
  const stayDetailContent = fs.readFileSync(stayDetailSheetPath, 'utf8');
  const checkoutContent = fs.readFileSync(checkoutSheetPath, 'utf8');
  const invoicePrintContent = fs.readFileSync(invoicePrintPath, 'utf8');

  it('1. occupantDocuments.js exports viewOccupantDocument which opens documents without sharing', () => {
    assert.ok(
      occupantDocsContent.includes('export async function viewOccupantDocument'),
      'occupantDocuments.js must export viewOccupantDocument'
    );
    assert.ok(
      occupantDocsContent.includes('File.preview'),
      'viewOccupantDocument must open file with File.preview'
    );
    // Ensure viewOccupantDocument itself does NOT invoke shareAsync
    const viewFnIndex = occupantDocsContent.indexOf('export async function viewOccupantDocument');
    const shareFnIndex = occupantDocsContent.indexOf('export async function shareOccupantDocument');
    const viewFnBody = occupantDocsContent.slice(viewFnIndex, shareFnIndex);
    assert.ok(
      !viewFnBody.includes('shareAsync'),
      'viewOccupantDocument function body must not call shareAsync'
    );
  });

  it('2. viewOccupantDocument verifies file existence, non-zero size, and handles errors', () => {
    assert.ok(
      occupantDocsContent.includes('FileSystem.getInfoAsync'),
      'fetchOccupantDocumentLocalFile must check file existence with getInfoAsync'
    );
    assert.ok(
      occupantDocsContent.includes('info.size === 0') || occupantDocsContent.includes('!info.exists'),
      'Must validate that downloaded document exists and has non-zero size'
    );
    assert.ok(
      occupantDocsContent.includes('status === 404'),
      'Must handle 404 missing document status'
    );
    assert.ok(
      occupantDocsContent.includes('status === 401') || occupantDocsContent.includes('status === 403'),
      'Must handle 401/403 access denied status'
    );
  });

  it('3. DocumentViewerSheet provides in-app preview with Back and Close navigation', () => {
    assert.ok(
      docViewerSheetContent.includes('SheetHeader'),
      'DocumentViewerSheet must render SheetHeader'
    );
    assert.ok(
      docViewerSheetContent.includes('onBack={onClose}'),
      'SheetHeader must provide onBack navigation'
    );
    assert.ok(
      docViewerSheetContent.includes('onClose={onClose}'),
      'SheetHeader must provide onClose navigation'
    );
    assert.ok(
      docViewerSheetContent.includes('ActivityIndicator'),
      'DocumentViewerSheet must show loading state while retrieving document'
    );
    assert.ok(
      docViewerSheetContent.includes('<Image'),
      'DocumentViewerSheet must render Image component for image document preview'
    );
    assert.ok(
      docViewerSheetContent.includes('viewOccupantDocument'),
      'DocumentViewerSheet must call viewOccupantDocument for PDF viewing'
    );
    assert.ok(
      !docViewerSheetContent.includes('Sharing.shareAsync') &&
      !docViewerSheetContent.includes("from 'expo-sharing'"),
      'DocumentViewerSheet must not use Expo Sharing'
    );
  });

  it('4. GuestDetailsScreen uses DocumentViewerSheet and viewOccupantDocument instead of shareOccupantDocument', () => {
    assert.ok(
      guestDetailsContent.includes('DocumentViewerSheet'),
      'GuestDetailsScreen must import and render DocumentViewerSheet'
    );
    assert.ok(
      !guestDetailsContent.includes('shareOccupantDocument'),
      'GuestDetailsScreen must not call shareOccupantDocument'
    );
  });

  it('5. RoomDetailsSheet, StayDetailSheet, and CheckoutSheet use viewOccupantDocument instead of shareOccupantDocument', () => {
    assert.ok(
      roomDetailsContent.includes('viewOccupantDocument'),
      'RoomDetailsSheet must import and call viewOccupantDocument'
    );
    assert.ok(
      !roomDetailsContent.includes('shareOccupantDocument'),
      'RoomDetailsSheet must not call shareOccupantDocument'
    );

    assert.ok(
      stayDetailContent.includes('viewOccupantDocument'),
      'StayDetailSheet must import and call viewOccupantDocument'
    );
    assert.ok(
      !stayDetailContent.includes('shareOccupantDocument'),
      'StayDetailSheet must not call shareOccupantDocument'
    );

    assert.ok(
      checkoutContent.includes('viewOccupantDocument'),
      'CheckoutSheet must import and call viewOccupantDocument'
    );
    assert.ok(
      !checkoutContent.includes('shareOccupantDocument'),
      'CheckoutSheet must not call shareOccupantDocument'
    );
  });

  it('6. Genuine Share buttons are preserved: InvoicePrintScreen retains Sharing.shareAsync for Share PDF', () => {
    assert.ok(
      invoicePrintContent.includes('Sharing.shareAsync'),
      'InvoicePrintScreen must retain Sharing.shareAsync for genuine Share PDF button'
    );
    assert.ok(
      invoicePrintContent.includes('Share PDF'),
      'InvoicePrintScreen must have "Share PDF" button'
    );
  });
});
