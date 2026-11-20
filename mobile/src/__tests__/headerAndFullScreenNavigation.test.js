import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Duplicate Headers & Application-Wide Full-Screen Navigation Verification', () => {
  const rootDrawerPath = path.join(srcDir, 'navigation', 'RootDrawer.jsx');
  const mainTabsPath = path.join(srcDir, 'navigation', 'MainTabs.jsx');
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const roomMasterPath = path.join(srcDir, 'screens', 'more', 'RoomMasterScreen.jsx');
  const roomDetailsSheetPath = path.join(srcDir, 'components', 'sheets', 'RoomDetailsSheet.jsx');
  const bookingsScreenPath = path.join(srcDir, 'screens', 'bookings', 'BookingsScreen.jsx');
  const dailyOpsScreenPath = path.join(srcDir, 'screens', 'dailyops', 'DailyOpsScreen.jsx');
  const roomsScreenPath = path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx');

  it('1. RootDrawer disables its header (headerShown: false) to prevent duplicate MainTabs header', () => {
    const rootDrawerContent = fs.readFileSync(rootDrawerPath, 'utf8');

    assert.ok(
      /headerShown:\s*false/.test(rootDrawerContent),
      'RootDrawer must have headerShown: false to avoid rendering unwanted top MainTabs header'
    );
    assert.ok(
      !/headerShown:\s*true/.test(rootDrawerContent),
      'RootDrawer must NOT have headerShown: true'
    );
  });

  it('2. MainTabs stacks render individual screen headers with DrawerButton and correct styling', () => {
    const mainTabsContent = fs.readFileSync(mainTabsPath, 'utf8');

    // DrawerButton opens navigation drawer
    assert.ok(
      mainTabsContent.includes('navigation.openDrawer()'),
      'DrawerButton must trigger navigation.openDrawer()'
    );

    // Each stack navigator uses headerOptions with DrawerButton
    assert.ok(
      mainTabsContent.includes("title: 'Rooms'"),
      'RoomsStack must set title: Rooms'
    );
    assert.ok(
      mainTabsContent.includes("title: 'Bookings'"),
      'BookingsStack must set title: Bookings'
    );
    assert.ok(
      mainTabsContent.includes("title: 'Daily Ops'"),
      'DailyOpsStack must set title: Daily Ops'
    );
    assert.ok(
      mainTabsContent.includes("title: 'Guests'"),
      'GuestsStack must set title: Guests'
    );
    assert.ok(
      mainTabsContent.includes("title: 'Bills'"),
      'BillsStack must set title: Bills'
    );
    assert.ok(
      mainTabsContent.includes("title: 'More'"),
      'MoreStack must set title: More'
    );
  });

  it('3. MainTabs dynamically hides bottom tab navigation (tabBarStyle: { display: "none" }) on all page-level sub-screens', () => {
    const mainTabsContent = fs.readFileSync(mainTabsPath, 'utf8');

    assert.ok(
      mainTabsContent.includes('getFocusedRouteNameFromRoute'),
      'MainTabs must import and use getFocusedRouteNameFromRoute'
    );
    assert.ok(
      mainTabsContent.includes("display: 'none'"),
      'MainTabs must return display: none for sub-screens to hide bottom tab navigation'
    );
    assert.ok(
      mainTabsContent.includes('RoomsHome') &&
      mainTabsContent.includes('BookingsHome') &&
      mainTabsContent.includes('DailyOpsHome') &&
      mainTabsContent.includes('GuestsHome') &&
      mainTabsContent.includes('BillsHome') &&
      mainTabsContent.includes('MoreMenu'),
      'MainTabs must specify root screens so all sub-screens automatically hide bottom tabs'
    );
  });

  it('4. Sheet.jsx renders full-screen Modal with safe area handling for complete workflows', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes('<Modal'),
      'Sheet must render React Native Modal component for true root-level presentation'
    );
    assert.ok(
      sheetContent.includes('animationType="slide"'),
      'Full-screen Sheet must use slide animation'
    );
    assert.ok(
      sheetContent.includes('onRequestClose={handleDismiss}'),
      'Modal must wire onRequestClose to handleDismiss for Android hardware Back'
    );
    assert.ok(
      sheetContent.includes('fullScreenSafe') && sheetContent.includes('SafeAreaView'),
      'Sheet must wrap modal content in SafeAreaView for proper status bar and safe area handling'
    );
  });

  it('5. Sheet.jsx supports compact={true} for small confirmation/selection dialogs', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes('compact = false') || sheetContent.includes('compact'),
      'Sheet must support compact prop'
    );
    assert.ok(
      sheetContent.includes('compactOverlay') && sheetContent.includes('compactCard'),
      'Sheet must have dedicated compact overlay and card styling for small dialogs'
    );
    assert.ok(
      sheetContent.includes('transparent={true}'),
      'Compact dialogs must use transparent Modal with scrim backdrop'
    );
  });

  it('6. RoomMasterScreen keeps individual room edit dialog compact while Add Rooms/Floor remains full-screen', () => {
    const roomMasterContent = fs.readFileSync(roomMasterPath, 'utf8');

    // editRoom must pass compact prop
    assert.ok(
      /<Sheet\s+compact\s+onClose=\{\(\)\s*=>\s*setEditRoom\(null\)\}>/.test(roomMasterContent),
      'RoomMasterScreen editRoom must pass compact prop to Sheet'
    );

    // addRoomsModal must NOT pass compact prop
    assert.ok(
      /<Sheet\s+onClose=\{\(\)\s*=>\s*setAddRoomsModal\(false\)\}>/.test(roomMasterContent),
      'RoomMasterScreen addRoomsModal must be full-screen'
    );

    // editType must NOT pass compact prop
    assert.ok(
      /<Sheet\s+onClose=\{\(\)\s*=>\s*setEditType\(null\)\}>/.test(roomMasterContent),
      'RoomMasterScreen editType must be full-screen'
    );
  });

  it('7. RoomDetailsSheet provides working BackButtons across all room statuses', () => {
    const roomDetailsContent = fs.readFileSync(roomDetailsSheetPath, 'utf8');

    assert.ok(
      roomDetailsContent.includes('import BackButton'),
      'RoomDetailsSheet must import BackButton'
    );

    // Check BackButton presence in headers
    const backBtnMatches = roomDetailsContent.match(/<BackButton\s+onPress=\{onClose\}/g);
    assert.ok(
      backBtnMatches && backBtnMatches.length >= 5,
      `RoomDetailsSheet must have BackButton in all 5 status headers (found ${backBtnMatches ? backBtnMatches.length : 0})`
    );
  });

  it('8. Page-level sheets across all screens render full-screen workflows', () => {
    const bookingsContent = fs.readFileSync(bookingsScreenPath, 'utf8');
    const dailyOpsContent = fs.readFileSync(dailyOpsScreenPath, 'utf8');
    const roomsContent = fs.readFileSync(roomsScreenPath, 'utf8');

    // Bookings screen: NewBookingSheet, BookingDetailSheet, CheckInSheet
    assert.ok(bookingsContent.includes('<NewBookingSheet'), 'BookingsScreen renders NewBookingSheet');
    assert.ok(bookingsContent.includes('<BookingDetailSheet'), 'BookingsScreen renders BookingDetailSheet');
    assert.ok(bookingsContent.includes('<CheckInSheet'), 'BookingsScreen renders CheckInSheet');

    // Daily ops: CheckoutSheet, CheckInSheet
    assert.ok(dailyOpsContent.includes('<CheckoutSheet'), 'DailyOpsScreen renders CheckoutSheet');
    assert.ok(dailyOpsContent.includes('<CheckInSheet'), 'DailyOpsScreen renders CheckInSheet');

    // Rooms: DirectCheckInPicker, RoomDetailsSheet, StayDetailSheet, CheckInSheet, CheckoutSheet, NewBookingSheet
    assert.ok(roomsContent.includes('<DirectCheckInPicker'), 'RoomsScreen renders DirectCheckInPicker');
    assert.ok(roomsContent.includes('<RoomDetailsSheet'), 'RoomsScreen renders RoomDetailsSheet');
    assert.ok(roomsContent.includes('<StayDetailSheet'), 'RoomsScreen renders StayDetailSheet');
    assert.ok(roomsContent.includes('<CheckInSheet'), 'RoomsScreen renders CheckInSheet');
    assert.ok(roomsContent.includes('<CheckoutSheet'), 'RoomsScreen renders CheckoutSheet');
    assert.ok(roomsContent.includes('<NewBookingSheet'), 'RoomsScreen renders NewBookingSheet');
  });
});
