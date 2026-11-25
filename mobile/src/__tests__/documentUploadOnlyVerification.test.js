import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Task Verification: Remove All Photo Upload Options and Keep Only Necessary Document Uploads', () => {
  const dailyOpsPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const guestDetailsPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
  const checkInSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');
  const checkoutSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
  const stayDetailSheetPath = path.join(srcDir, 'components', 'sheets', 'StayDetailSheet.jsx');
  const newBookingSheetPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
  const bookingDetailSheetPath = path.join(srcDir, 'components', 'sheets', 'BookingDetailSheet.jsx');
  const photoUploadSheetPath = path.join(srcDir, 'components', 'sheets', 'PhotoUploadSheet.jsx');

  const dailyOpsContent = fs.readFileSync(dailyOpsPath, 'utf8');
  const guestDetailsContent = fs.readFileSync(guestDetailsPath, 'utf8');
  const checkInContent = fs.readFileSync(checkInSheetPath, 'utf8');
  const checkoutContent = fs.readFileSync(checkoutSheetPath, 'utf8');
  const stayDetailContent = fs.readFileSync(stayDetailSheetPath, 'utf8');
  const newBookingContent = fs.readFileSync(newBookingSheetPath, 'utf8');
  const bookingDetailContent = fs.readFileSync(bookingDetailSheetPath, 'utf8');

  // -------------------------------------------------------------------------
  // 1. Remove Photo Upload Functionality
  // -------------------------------------------------------------------------
  describe('1. Removal of Photo Upload Options', () => {
    it('1. Daily Ops – No "Upload Photo" button, no PhotoUploadSheet import or modal sheet', () => {
      assert.ok(!dailyOpsContent.includes('📷 Upload Photo'), 'DailyOps must not render Upload Photo button');
      assert.ok(!dailyOpsContent.includes('PhotoUploadSheet'), 'DailyOps must not import or render PhotoUploadSheet');
      assert.ok(!dailyOpsContent.includes("type: 'upload_photo'"), 'DailyOps must not have upload_photo sheet handler');
    });

    it('2. Guest Details – No "Upload Photo", "Replace Photo", or ImagePicker', () => {
      assert.ok(!guestDetailsContent.includes('Upload Photo'), 'GuestDetails must not render Upload Photo');
      assert.ok(!guestDetailsContent.includes('Replace Photo'), 'GuestDetails must not render Replace Photo');
      assert.ok(!guestDetailsContent.includes('expo-image-picker'), 'GuestDetails must not import expo-image-picker');
      assert.ok(!guestDetailsContent.includes('ImagePicker'), 'GuestDetails must not use ImagePicker');
      assert.ok(!guestDetailsContent.includes('handlePickIdPhoto'), 'GuestDetails must not have handlePickIdPhoto');
      assert.ok(!guestDetailsContent.includes('pendingPhoto'), 'GuestDetails must not use pendingPhoto state');
    });

    it('3. CheckInSheet – No "Upload Photo", no occupant photo option, no ImagePicker', () => {
      assert.ok(!checkInContent.includes('Upload Photo'), 'CheckInSheet must not render Upload Photo');
      assert.ok(!checkInContent.includes('expo-image-picker'), 'CheckInSheet must not import expo-image-picker');
      assert.ok(!checkInContent.includes('ImagePicker'), 'CheckInSheet must not use ImagePicker');
      assert.ok(!checkInContent.includes('pickPhoto'), 'CheckInSheet must not have pickPhoto function');
    });

    it('4. PhotoUploadSheet component is removed entirely', () => {
      assert.ok(!fs.existsSync(photoUploadSheetPath), 'PhotoUploadSheet.jsx must be deleted as it has no callers');
    });

    it('5. No camera icons or camera libraries used for photo uploads across all sheets', () => {
      const allFiles = [dailyOpsContent, guestDetailsContent, checkInContent, checkoutContent, stayDetailContent, newBookingContent, bookingDetailContent];
      for (const content of allFiles) {
        assert.ok(!content.includes('expo-camera'), 'Must not import expo-camera');
        assert.ok(!content.includes('📷 Upload Photo'), 'Must not render camera upload photo buttons');
        assert.ok(!content.includes('Take Photo'), 'Must not render Take Photo');
        assert.ok(!content.includes('Photo ID Upload'), 'Must not render Photo ID Upload');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Keep Document Upload Functionality
  // -------------------------------------------------------------------------
  describe('2. Retention and Implementation of Document Uploads', () => {
    it('A. Guest Details retains document upload and viewing via DocumentPicker', () => {
      assert.ok(guestDetailsContent.includes('DocumentPicker'), 'GuestDetails must import DocumentPicker');
      assert.ok(guestDetailsContent.includes('handlePickDocument'), 'GuestDetails must implement handlePickDocument');
      assert.ok(guestDetailsContent.includes('handleUploadSelectedDoc'), 'GuestDetails must implement handleUploadSelectedDoc');
      assert.ok(guestDetailsContent.includes('selectedDoc'), 'GuestDetails must hold selectedDoc');
      assert.ok(guestDetailsContent.includes('Remove Selected Document'), 'GuestDetails must allow removing selected document');
      assert.ok(guestDetailsContent.includes('Upload ID Document'), 'GuestDetails must provide Upload ID Document button');
      assert.ok(guestDetailsContent.includes('View Document'), 'GuestDetails must provide View Document button');
      assert.ok(guestDetailsContent.includes('DocumentViewerSheet'), 'GuestDetails must integrate DocumentViewerSheet');
      assert.ok(guestDetailsContent.includes('handleDeleteDoc'), 'GuestDetails must preserve document deletion');
    });

    it('B. Direct Check-in retains occupant document upload and assignment logic', () => {
      assert.ok(checkInContent.includes('DocumentPicker'), 'CheckInSheet must import DocumentPicker');
      assert.ok(checkInContent.includes('pickDocument'), 'CheckInSheet must implement pickDocument');
      assert.ok(checkInContent.includes('Upload ID Document (P') || checkInContent.includes('Attach Document (P'), 'CheckInSheet must offer document upload per occupant');
      assert.ok(checkInContent.includes('occupantTarget'), 'CheckInSheet must maintain occupantTarget assignment');
      assert.ok(checkInContent.includes('allOccupantsHaveIdProof'), 'CheckInSheet must enforce occupant ID proof rules');
      assert.ok(checkInContent.includes('Remove Selected Document') || checkInContent.includes('removeFile'), 'CheckInSheet must allow removing selected file before check-in');
    });

    it('C. Reservation Check-in retains pre-booking document assignment', () => {
      assert.ok(checkInContent.includes('preBookingDocs'), 'CheckInSheet must load preBookingDocs');
      assert.ok(checkInContent.includes('preBookingAssignments'), 'CheckInSheet must support assigning preBookingDocs to occupants');
      assert.ok(checkInContent.includes('Pre-Booking Documents'), 'CheckInSheet must render Pre-Booking Documents section');
    });

    it('D. Checkout Sheet retains additional ID document upload and viewing', () => {
      assert.ok(checkoutContent.includes('DocumentPicker'), 'CheckoutSheet must import DocumentPicker');
      assert.ok(checkoutContent.includes('handlePostCheckInUpload'), 'CheckoutSheet must have handlePostCheckInUpload');
      assert.ok(checkoutContent.includes('Upload ID Document') || checkoutContent.includes('+ Upload ID Document'), 'CheckoutSheet must have Upload ID Document button');
      assert.ok(checkoutContent.includes('viewOccupantDocument') || checkoutContent.includes('View Document'), 'CheckoutSheet must support document viewing');
    });

    it('E. Stay Details implements document upload ported from web', () => {
      assert.ok(stayDetailContent.includes('DocumentPicker'), 'StayDetailSheet must import DocumentPicker');
      assert.ok(stayDetailContent.includes('useUploadStayDocuments'), 'StayDetailSheet must import useUploadStayDocuments');
      assert.ok(stayDetailContent.includes('handleUploadStayDoc'), 'StayDetailSheet must implement handleUploadStayDoc');
      assert.ok(stayDetailContent.includes('+ Upload ID Document'), 'StayDetailSheet must render + Upload ID Document button');
      assert.ok(stayDetailContent.includes('View Document'), 'StayDetailSheet must support View Document');
      assert.ok(stayDetailContent.includes('handleDeleteDocument'), 'StayDetailSheet must support document deletion');
    });

    it('F. Booking Details implements document upload and viewing', () => {
      assert.ok(bookingDetailContent.includes('DocumentPicker'), 'BookingDetailSheet must import DocumentPicker');
      assert.ok(bookingDetailContent.includes('useUploadReservationDocuments'), 'BookingDetailSheet must use useUploadReservationDocuments');
      assert.ok(bookingDetailContent.includes('handleUploadBookingDoc'), 'BookingDetailSheet must implement handleUploadBookingDoc');
      assert.ok(bookingDetailContent.includes('+ Upload ID Document'), 'BookingDetailSheet must render + Upload ID Document button');
      assert.ok(bookingDetailContent.includes('View Document'), 'BookingDetailSheet must support View Document');
      assert.ok(bookingDetailContent.includes('handleDeleteDocument'), 'BookingDetailSheet must support document deletion');
    });

    it('G. New Booking provides optional document upload without making it mandatory', () => {
      assert.ok(newBookingContent.includes('DocumentPicker'), 'NewBookingSheet must import DocumentPicker');
      assert.ok(newBookingContent.includes('handlePickDocument'), 'NewBookingSheet must implement handlePickDocument');
      assert.ok(newBookingContent.includes('ID Proof Documents (Optional)'), 'NewBookingSheet must display ID Proof Documents (Optional)');
      assert.ok(newBookingContent.includes('+ Attach Document'), 'NewBookingSheet must have + Attach Document button');
      assert.ok(newBookingContent.includes('Remove Selected Document'), 'NewBookingSheet must allow removing selected document');
      // Verify documents are NOT in required validation
      assert.ok(!newBookingContent.includes("errs.documents = 'ID document is required'"), 'Document upload must be optional in NewBookingSheet');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Supported Document Types and Backend Compatibility
  // -------------------------------------------------------------------------
  describe('3. Supported Document Types: PDF, JPEG, PNG, WebP', () => {
    it('Document pickers accept application/pdf, image/jpeg, image/png, image/webp', () => {
      const typeChecks = [
        checkInContent,
        guestDetailsContent,
        stayDetailContent,
        checkoutContent,
        newBookingContent,
        bookingDetailContent,
      ];
      for (const content of typeChecks) {
        assert.ok(content.includes('application/pdf'), 'Must accept application/pdf');
        assert.ok(content.includes('image/jpeg'), 'Must accept image/jpeg');
        assert.ok(content.includes('image/png'), 'Must accept image/png');
        assert.ok(content.includes('image/webp'), 'Must accept image/webp');
      }
    });

    it('Backend IdImageUploader supports PDF, JPEG, PNG, WebP up to 10 MB', () => {
      const uploaderPath = path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'Support', 'IdImageUploader.php');
      const uploaderContent = fs.readFileSync(uploaderPath, 'utf8');
      assert.ok(uploaderContent.includes("'application/pdf' => 'pdf'"), 'IdImageUploader must accept application/pdf');
      assert.ok(uploaderContent.includes("'image/jpeg' => 'jpg'"), 'IdImageUploader must accept image/jpeg');
      assert.ok(uploaderContent.includes("'image/png' => 'png'"), 'IdImageUploader must accept image/png');
      assert.ok(uploaderContent.includes("'image/webp' => 'webp'"), 'IdImageUploader must accept image/webp');
      assert.ok(uploaderContent.includes('10 * 1024 * 1024'), 'IdImageUploader must allow up to 10 MB');
    });

    it('Backend OccupantDocumentUploader supports PDF, JPEG, PNG, WebP up to 10 MB', () => {
      const uploaderPath = path.resolve(__dirname, '..', '..', '..', 'backend', 'src', 'Support', 'OccupantDocumentUploader.php');
      const uploaderContent = fs.readFileSync(uploaderPath, 'utf8');
      assert.ok(uploaderContent.includes("'application/pdf' => 'pdf'"), 'OccupantDocumentUploader must accept application/pdf');
      assert.ok(uploaderContent.includes("'image/jpeg' => 'jpg'"), 'OccupantDocumentUploader must accept image/jpeg');
      assert.ok(uploaderContent.includes('10 * 1024 * 1024'), 'OccupantDocumentUploader must allow up to 10 MB');
    });
  });
});
