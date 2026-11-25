import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile UI Interaction & Control Flow Tests', () => {

  // --------------------------------------------------------------------------
  // Module 1: Login & Authentication UI
  // --------------------------------------------------------------------------
  it('Module 1: LoginScreen UI controls, form inputs, and validation handlers', () => {
    const loginPath = path.join(srcDir, 'screens', 'LoginScreen.jsx');
    const content = fs.readFileSync(loginPath, 'utf8');

    // Controls: Username Input, Password Input, Sign In Button
    assert.ok(content.includes('name="username"'), 'LoginScreen must declare username Controller');
    assert.ok(content.includes('name="password"'), 'LoginScreen must declare password Controller');
    assert.ok(content.includes('label="Username"'), 'LoginScreen must render Username field');
    assert.ok(content.includes('label="Password"'), 'LoginScreen must render Password field');
    assert.ok(content.includes('isPassword'), 'LoginScreen must mark Password field as secure');
    assert.ok(content.includes('Sign in'), 'LoginScreen must contain Sign in button');
    assert.ok(content.includes('loading={isSubmitting}'), 'Sign In button must reflect loading state');

    // Validation
    assert.ok(content.includes('Username is required'), 'LoginScreen must validate username required');
    assert.ok(content.includes('Password is required'), 'LoginScreen must validate password required');
    assert.ok(content.includes('zodResolver'), 'LoginScreen must use zodResolver');
  });

  // --------------------------------------------------------------------------
  // Module 2: Rooms Dashboard & Room Details UI
  // --------------------------------------------------------------------------
  it('Module 2: RoomsScreen & RoomDetailsSheet UI controls and status transitions', () => {
    const roomsPath = path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx');
    const detailsPath = path.join(srcDir, 'components', 'sheets', 'RoomDetailsSheet.jsx');
    const roomsContent = fs.readFileSync(roomsPath, 'utf8');
    const detailsContent = fs.readFileSync(detailsPath, 'utf8');

    // Action buttons
    assert.ok(roomsContent.includes('+ Direct Check-in'), 'RoomsScreen must contain Direct Check-in button');
    assert.ok(roomsContent.includes('+ Pre Booking'), 'RoomsScreen must contain Pre Booking button');

    // Status filter chips
    assert.ok(roomsContent.includes("STATUS_ORDER = ['free', 'booked', 'occupied', 'cleaning', 'repair', 'overdue']"), 'Must define 6 status filters');
    assert.ok(roomsContent.includes('setFilter('), 'Must allow tapping chips to filter rooms');

    // RoomDetails actions
    assert.ok(detailsContent.includes('Check In') || detailsContent.includes('Check in guest'), 'Must offer check in action');
    assert.ok(detailsContent.includes('Check Out') || detailsContent.includes('onCheckout'), 'Must offer check out action');
    assert.ok(detailsContent.includes('Mark Cleaned') || detailsContent.includes('Mark ready') || detailsContent.includes('ready'), 'Must offer ready action');
    assert.ok(detailsContent.includes('Send for Repair') || detailsContent.includes('repair'), 'Must offer repair action');
  });

  // --------------------------------------------------------------------------
  // Module 3: Direct Check-in UI
  // --------------------------------------------------------------------------
  it('Module 3: DirectCheckInPicker & CheckInSheet UI interaction controls', () => {
    const pickerPath = path.join(srcDir, 'components', 'sheets', 'DirectCheckInPicker.jsx');
    const checkInPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');
    const pickerContent = fs.readFileSync(pickerPath, 'utf8');
    const checkInContent = fs.readFileSync(checkInPath, 'utf8');
    assert.ok(pickerContent.includes('onPick'), 'Picker must trigger onPick on room select');
    assert.ok(checkInContent.includes('buttonTitle'), 'CheckInSheet must bind dynamic check-in button');
    assert.ok(checkInContent.includes('handlePersonsChange') && checkInContent.includes('Stepper'), 'Must allow setting persons and occupants via Stepper');
    assert.ok(checkInContent.includes('DocumentPicker') || checkInContent.includes('pickDocument'), 'Must support document picking');
    assert.ok(!checkInContent.includes('ImagePicker') && !checkInContent.includes('pickPhoto'), 'Must not have separate photo picker');
    assert.ok(checkInContent.includes('ADVANCE_REQUIRED_MSG'), 'Must enforce advance collection before checkin');
  });

  // --------------------------------------------------------------------------
  // Module 4: New Booking & Booking Editing UI
  // --------------------------------------------------------------------------
  it('Module 4: NewBookingSheet & BookingDetailSheet UI interaction controls', () => {
    const newBookingPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
    const detailPath = path.join(srcDir, 'components', 'sheets', 'BookingDetailSheet.jsx');
    const newBookingContent = fs.readFileSync(newBookingPath, 'utf8');
    const detailContent = fs.readFileSync(detailPath, 'utf8');

    assert.ok(newBookingContent.includes('Mobile number'), 'Must contain mobile number input');
    assert.ok(newBookingContent.includes('Guest name'), 'Must contain guest name input');
    assert.ok(newBookingContent.includes('Coming on'), 'Must contain check-in date input');
    assert.ok(newBookingContent.includes('Days'), 'Must contain days of stay stepper');
    assert.ok(newBookingContent.includes('Save Booking') || newBookingContent.includes('Change booking') || newBookingContent.includes('New booking'), 'Must contain save booking action');

    // Booking Details actions
    assert.ok(detailContent.includes('Guest came · Check in'), 'Must offer check in action from booking');
    assert.ok(detailContent.includes('Edit booking'), 'Must offer edit booking action');
    assert.ok(detailContent.includes('Cancel booking'), 'Must offer cancellation action');
    assert.ok(detailContent.includes('cancellationFee') || detailContent.includes('preview'), 'Must preview cancellation fee and refund');
  });

  // --------------------------------------------------------------------------
  // Module 5: Checkout & Billing UI
  // --------------------------------------------------------------------------
  it('Module 5: CheckoutSheet UI controls, extra charges, and settlement', () => {
    const sheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(content.includes('addExtraCharge'), 'Must support adding extra charges');
    assert.ok(content.includes('handleApplyDiscount'), 'Must support applying discounts');
    assert.ok(content.includes('doCheckout'), 'Must contain checkout action');
    assert.ok(content.includes('bal > 0') && content.includes('bal < 0'), 'Must handle both balance due and refund due');
    assert.ok(content.includes('refundReason'), 'Must capture refund reason when balance is negative');
  });

  // --------------------------------------------------------------------------
  // Module 6: Daily Operations UI
  // --------------------------------------------------------------------------
  it('Module 6: DailyOpsScreen tab switching, search, and action launchers', () => {
    const dailyPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
    const content = fs.readFileSync(dailyPath, 'utf8');

    assert.ok(content.includes("setActiveTab('checkins')") || content.includes("handleTabChange('checkins')"), 'Must support check-ins tab');
    assert.ok(content.includes("setActiveTab('checkouts')") || content.includes("handleTabChange('checkouts')"), 'Must support check-outs tab');
    assert.ok(content.includes('SearchInput'), 'Must include search bar');
    assert.ok(content.includes('handleTilePress'), 'Must allow filtering by status tile');
    assert.ok(content.includes('WhatsAppSheet'), 'Must connect to WhatsApp reminder sheet');
  });

  // --------------------------------------------------------------------------
  // Module 7: Guests & Guest Details UI
  // --------------------------------------------------------------------------
  it('Module 7: GuestsScreen & GuestDetailsScreen profile, documents, and editing', () => {
    const guestsPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
    const detailsPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
    const guestsContent = fs.readFileSync(guestsPath, 'utf8');
    const detailsContent = fs.readFileSync(detailsPath, 'utf8');

    assert.ok(guestsContent.includes('SearchInput'), 'Must support guest search');
    assert.ok(detailsContent.includes('handlePickDocument'), 'Must support picking ID document');
    assert.ok(!detailsContent.includes('ImagePicker'), 'Must not import ImagePicker');
    assert.ok(detailsContent.includes('GuestEditSheet'), 'Must connect to GuestEditSheet');
    assert.ok(detailsContent.includes('DocumentViewerSheet'), 'Must connect to DocumentViewerSheet');
  });

  // --------------------------------------------------------------------------
  // Module 8: Referrals UI
  // --------------------------------------------------------------------------
  it('Module 8: AllReferralsScreen summary metrics, filtering, and search', () => {
    const refsPath = path.join(srcDir, 'screens', 'guests', 'AllReferralsScreen.jsx');
    const content = fs.readFileSync(refsPath, 'utf8');

    assert.ok(content.includes('total_referral_bookings'), 'Must display total referral bookings');
    assert.ok(content.includes('unique_referred_guests'), 'Must display unique referred guests');
    assert.ok(content.includes('SearchInput'), 'Must support referral search');
    assert.ok(content.includes('setStatusFilter'), 'Must support referral status sub-filters');
  });

  // --------------------------------------------------------------------------
  // Module 9: Bills & Invoices UI
  // --------------------------------------------------------------------------
  it('Module 9: BillsScreen & InvoicePrintScreen preview, print, and share', () => {
    const billsPath = path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx');
    const printPath = path.join(srcDir, 'screens', 'bills', 'InvoicePrintScreen.jsx');
    const billsContent = fs.readFileSync(billsPath, 'utf8');
    const printContent = fs.readFileSync(printPath, 'utf8');

    assert.ok(billsContent.includes('FlatList'), 'Bills must render in FlatList');
    assert.ok(printContent.includes('Print.printAsync'), 'Must trigger native print');
    assert.ok(printContent.includes('Sharing.shareAsync'), 'Must trigger native share');
    assert.ok(printContent.includes('buildInvoiceHtml'), 'Must render tax invoice HTML preview');
  });

  // --------------------------------------------------------------------------
  // Module 10: Reports UI
  // --------------------------------------------------------------------------
  it('Module 10: ReportsScreen today, day-end, and CSV export UI', () => {
    const repPath = path.join(srcDir, 'screens', 'more', 'ReportsScreen.jsx');
    const content = fs.readFileSync(repPath, 'utf8');

    assert.ok(content.includes('Today at a glance'), 'Must display today report');
    assert.ok(content.includes('Day-end collection'), 'Must display day-end report');
    assert.ok(content.includes('exportCsv'), 'Must contain CSV export handler');
    assert.ok(content.includes('downloadInvoicesCsv'), 'Must call downloadInvoicesCsv');
  });

  // --------------------------------------------------------------------------
  // Module 11: Room Master UI
  // --------------------------------------------------------------------------
  it('Module 11: RoomMasterScreen room layout, room types, and status editing', () => {
    const rmPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
    const content = fs.readFileSync(rmPath, 'utf8');

    assert.ok(content.includes("setActiveTab('rooms')") || content.includes("setActiveTab('types')"), 'Must toggle between rooms and types');
    assert.ok(content.includes('+ Add Rooms'), 'Must offer Add Rooms action');
    assert.ok(content.includes('+ Add Type'), 'Must offer Add Type action');
    assert.ok(content.includes('Save Room Type'), 'Must support saving room types');
  });

  // --------------------------------------------------------------------------
  // Module 12: Users & Permissions UI
  // --------------------------------------------------------------------------
  it('Module 12: UsersScreen list, add, edit, and role picker', () => {
    const usersPath = path.join(srcDir, 'screens', 'more', 'UsersScreen.jsx');
    const content = fs.readFileSync(usersPath, 'utf8');

    assert.ok(content.includes('+ Add user'), 'Must offer Add user action');
    assert.ok(content.includes('Full Name'), 'Must require full name');
    assert.ok(content.includes('Username'), 'Must require username');
    assert.ok(content.includes('Password'), 'Must require password for new users');
    assert.ok(content.includes('is_active'), 'Must allow toggling active status');
  });

  // --------------------------------------------------------------------------
  // Module 13: Settings & GST Configuration UI
  // --------------------------------------------------------------------------
  it('Module 13: SettingsScreen hotel info, checkout hour, and GST slabs', () => {
    const setPath = path.join(srcDir, 'screens', 'more', 'SettingsScreen.jsx');
    const content = fs.readFileSync(setPath, 'utf8');

    assert.ok(content.includes('Hotel name'), 'Must bind hotel name input');
    assert.ok(content.includes('Standard Checkout Time'), 'Must allow setting checkout time');
    assert.ok(content.includes('Edit GST Settings'), 'Must offer Edit GST Settings action');
    assert.ok(content.includes('gstDraft.gstSlab1GstRate'), 'Must allow editing Slab 1 rate');
  });

  // --------------------------------------------------------------------------
  // Module 14: Navigation (Drawer & Tabs)
  // --------------------------------------------------------------------------
  it('Module 14: RootDrawer & MainTabs navigation structure and logout dialog', () => {
    const drawerPath = path.join(srcDir, 'navigation', 'CustomDrawerContent.jsx');
    const tabsPath = path.join(srcDir, 'navigation', 'MainTabs.jsx');
    const drawerContent = fs.readFileSync(drawerPath, 'utf8');
    const tabsContent = fs.readFileSync(tabsPath, 'utf8');

    assert.ok(drawerContent.includes('confirmLogout'), 'Must confirm logout before signing out');
    assert.ok(drawerContent.includes('Alert.alert'), 'Must use native Alert for logout confirmation');
    assert.ok(tabsContent.includes('Rooms'), 'Must contain Rooms tab');
    assert.ok(tabsContent.includes('Bookings'), 'Must contain Bookings tab');
    assert.ok(tabsContent.includes('DailyOps'), 'Must contain Daily Ops tab');
    assert.ok(tabsContent.includes('Guests'), 'Must contain Guests tab');
    assert.ok(tabsContent.includes('Bills'), 'Must contain Bills tab');
    assert.ok(tabsContent.includes('More'), 'Must contain More tab');
  });
});
