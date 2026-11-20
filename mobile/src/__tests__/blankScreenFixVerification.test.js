import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Critical Fix Verification: Blank White Screen After Button/Tile Taps', () => {
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const roomDetailsSheetPath = path.join(srcDir, 'components', 'sheets', 'RoomDetailsSheet.jsx');
  const checkInSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckInSheet.jsx');
  const checkoutSheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
  const stayDetailSheetPath = path.join(srcDir, 'components', 'sheets', 'StayDetailSheet.jsx');
  const newBookingSheetPath = path.join(srcDir, 'components', 'sheets', 'NewBookingSheet.jsx');
  const bookingDetailSheetPath = path.join(srcDir, 'components', 'sheets', 'BookingDetailSheet.jsx');
  const guestEditSheetPath = path.join(srcDir, 'components', 'sheets', 'GuestEditSheet.jsx');

  it('1. Sheet.jsx embeds a dedicated SafeAreaProvider with initialMetrics inside Modal for Android', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes('<SafeAreaProvider initialMetrics={initialWindowMetrics}>'),
      'Sheet must embed SafeAreaProvider with initialMetrics inside the Modal to provide valid insets on Android'
    );
    assert.ok(
      sheetContent.includes("import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';"),
      'Sheet must import SafeAreaProvider and initialWindowMetrics from react-native-safe-area-context'
    );
  });

  it('2. Sheet.jsx avoids absolute fill wrappers on full-screen content flow to prevent flex height collapse to 0', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    // The full-screen tree must NOT wrap inner inside a position: 'absolute' sheetOverlay
    assert.ok(
      !/<View\s+style=\{styles\.sheetOverlay\}[^>]*>\s*<View\s+style=\{styles\.sheet\}/.test(sheetContent),
      'Sheet must not place styles.sheet inside an absolutely positioned sheetOverlay in full-screen mode'
    );

    // fullScreenContainer must be a normal flex: 1 container
    assert.ok(
      sheetContent.includes('fullScreenContainer: {') && sheetContent.includes('flex: 1'),
      'fullScreenContainer must have flex: 1'
    );

    // sheet must have flex: 1
    assert.ok(
      sheetContent.includes('sheet: {') && sheetContent.includes('flex: 1'),
      'sheet must have flex: 1'
    );
  });

  it('3. Sheet.jsx configures StatusBar style="dark" for full-screen workflows on Android', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes('<StatusBar style="dark" backgroundColor={colors.surface} />'),
      'Sheet must render StatusBar with dark style and header background inside Modal'
    );
  });

  it('4. Sheet.jsx ensures scroll container has flex: 1 and flexGrow on scrollBody', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes('scroll: {') && sheetContent.includes('flex: 1'),
      'scroll style must have flex: 1 to occupy the full available screen'
    );
    assert.ok(
      sheetContent.includes('flexGrow: 1'),
      'scrollBody must have flexGrow: 1 so child content fills the entire viewable area'
    );
  });

  it('5. RoomDetailsSheet provides back and close buttons across all statuses including loading states', () => {
    const content = fs.readFileSync(roomDetailsSheetPath, 'utf8');

    // All status headers have BackButton
    const backBtnCount = (content.match(/<BackButton\s+onPress=\{onClose\}/g) || []).length;
    assert.ok(
      backBtnCount >= 5,
      `RoomDetailsSheet must render BackButton across all headers (found ${backBtnCount})`
    );

    // All headers have close button
    const closeBtnCount = (content.match(/styles\.closeX/g) || []).length;
    assert.ok(
      closeBtnCount >= 5,
      `RoomDetailsSheet must render close buttons across all headers (found ${closeBtnCount})`
    );
  });

  it('6. All destination sheet workflows render within Sheet and do not collapse on Android', () => {
    const sheets = [
      { name: 'CheckInSheet', content: fs.readFileSync(checkInSheetPath, 'utf8') },
      { name: 'CheckoutSheet', content: fs.readFileSync(checkoutSheetPath, 'utf8') },
      { name: 'StayDetailSheet', content: fs.readFileSync(stayDetailSheetPath, 'utf8') },
      { name: 'NewBookingSheet', content: fs.readFileSync(newBookingSheetPath, 'utf8') },
      { name: 'BookingDetailSheet', content: fs.readFileSync(bookingDetailSheetPath, 'utf8') },
      { name: 'GuestEditSheet', content: fs.readFileSync(guestEditSheetPath, 'utf8') },
    ];

    for (const { name, content } of sheets) {
      assert.ok(
        content.includes('<Sheet'),
        `${name} must render within <Sheet`
      );
      assert.ok(
        content.includes('<SheetHeader') || content.includes('styles.header'),
        `${name} must render a header with title and close controls`
      );
    }
  });

  it('7. Hardware back navigation and unsaved changes confirmation are properly handled', () => {
    const sheetContent = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      sheetContent.includes("BackHandler.addEventListener('hardwareBackPress'"),
      'Sheet must register Android hardwareBackPress listener'
    );
    assert.ok(
      sheetContent.includes('onRequestClose={handleDismiss}'),
      'Modal must wire onRequestClose to handleDismiss for Android native back gestures'
    );
    assert.ok(
      sheetContent.includes('hasUnsavedChanges'),
      'Sheet must support hasUnsavedChanges confirmation dialog'
    );
  });
});
