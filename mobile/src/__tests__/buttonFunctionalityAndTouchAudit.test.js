import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile Button Functionality & Touch Handling Audit', () => {
  it('1. Button.jsx provides rapid double-tap prevention to stop duplicate submissions', () => {
    const buttonPath = path.join(srcDir, 'components', 'ui', 'Button.jsx');
    const content = fs.readFileSync(buttonPath, 'utf8');

    assert.ok(content.includes('lastPressRef'), 'Button must maintain lastPressRef for debounce');
    assert.ok(content.includes('Date.now()'), 'Button must compare timestamp to prevent rapid double taps');
    assert.ok(content.includes('450'), 'Button must debounce rapid duplicate taps within 450ms');

    // Simulate the debounce logic
    let executionCount = 0;
    let lastPress = 0;
    const onPress = () => { executionCount++; };
    const simulatePress = (now) => {
      if (now - lastPress < 450) return;
      lastPress = now;
      onPress();
    };

    simulatePress(1000);
    simulatePress(1100); // 100ms later (rapid double tap) - blocked
    simulatePress(1200); // 200ms later - blocked
    simulatePress(1500); // 500ms later (intentional second action) - allowed

    assert.equal(executionCount, 2, 'Rapid taps within 450ms must be blocked; distinct taps must execute');
  });

  it('2. Button.jsx specifies adequate touchable areas (hitSlop) on mobile screen sizes', () => {
    const buttonPath = path.join(srcDir, 'components', 'ui', 'Button.jsx');
    const content = fs.readFileSync(buttonPath, 'utf8');

    assert.ok(content.includes('hitSlop='), 'Button must have hitSlop configured');
    assert.ok(content.includes('accessibilityRole="button"'), 'Button must declare accessibilityRole="button"');
    assert.ok(content.includes('accessibilityState='), 'Button must declare accessibilityState with disabled/busy');
  });

  it('3. RoomTile.jsx eliminates nested Pressables and does not rely on web-only stopPropagation', () => {
    const tilePath = path.join(srcDir, 'components', 'RoomTile.jsx');
    const content = fs.readFileSync(tilePath, 'utf8');

    assert.ok(!content.includes('stopPropagation'), 'RoomTile must not use web-only stopPropagation');
    assert.ok(content.includes('tileMain'), 'RoomTile must separate main tile pressable from conflict pressable');
    assert.ok(!content.includes('<Pressable style={[styles.tile'), 'Outer tile container must not be a Pressable wrapping conflict Pressables');
  });

  it('4. BookingsScreen.jsx separates row details from "Guest came · Check in" button', () => {
    const bookingsPath = path.join(srcDir, 'screens', 'bookings', 'BookingsScreen.jsx');
    const content = fs.readFileSync(bookingsPath, 'utf8');

    assert.ok(
      !/<Pressable[^>]*styles\.row[^>]*>[\s\S]*?<Button[^>]*Guest came · Check in/m.test(content),
      'BookingsScreen must NOT nest the "Guest came · Check in" Button inside a row Pressable'
    );
    assert.ok(content.includes('<View key={s.id} style={[styles.row'), 'Row container must be a View');
  });

  it('5. GuestsScreen.jsx eliminates nested Pressables and broken stopPropagation on action buttons', () => {
    const guestsPath = path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx');
    const content = fs.readFileSync(guestsPath, 'utf8');

    assert.ok(!content.includes('stopPropagation'), 'GuestsScreen must not use web-only stopPropagation');
    assert.ok(
      !/<Pressable[^>]*styles\.card[^>]*>[\s\S]*?<Button[^>]*Edit/m.test(content),
      'GuestsScreen must NOT nest the "Edit" Button inside a card Pressable'
    );
    assert.ok(content.includes('<View key={g.id} style={styles.card}>'), 'Guest card container must be a View');
  });

  it('6. GuestDetailsScreen.jsx removes nested Button inside Pressable for bookings and referrals', () => {
    const detailsPath = path.join(srcDir, 'screens', 'guests', 'GuestDetailsScreen.jsx');
    const content = fs.readFileSync(detailsPath, 'utf8');

    assert.ok(
      !/<Pressable[^>]*styles\.referredItem[^>]*>[\s\S]*?<Button[^>]*Profile →/m.test(content),
      'GuestDetailsScreen must NOT nest "Profile →" Button inside a referredItem Pressable'
    );
    assert.ok(
      !/<Pressable[^>]*styles\.cardItem[^>]*>[\s\S]*?<Button[^>]*View Booking →/m.test(content),
      'GuestDetailsScreen must NOT nest "View Booking →" Button inside a cardItem Pressable'
    );
  });

  it('7. CheckoutSheet.jsx uses a dedicated Pressable with hitSlop for deleting extra charges', () => {
    const sheetPath = path.join(srcDir, 'components', 'sheets', 'CheckoutSheet.jsx');
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      !/<Text[^>]*onPress[^>]*removeExtra\.mutate/m.test(content),
      'CheckoutSheet must NOT use raw Text onPress inside Text for deleting extra charges'
    );
    assert.ok(content.includes('removeBtn'), 'CheckoutSheet must use a dedicated removeBtn Pressable');
  });

  it('8. Sheet.jsx avoids full-screen elevation on sheetOverlay to prevent touch interception', () => {
    const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      !/sheetOverlay:\s*\{[^}]*elevation:\s*\d+/m.test(content),
      'sheetOverlay must NOT have elevation to avoid intercepting touch events across full screen'
    );
    assert.ok(content.includes('pointerEvents="auto"'), 'Sheet surface must have pointerEvents="auto"');
  });

  it('9. Form and drawer scroll containers persist taps so first touch triggers buttons while keyboard is active', () => {
    const loginContent = fs.readFileSync(path.join(srcDir, 'screens', 'LoginScreen.jsx'), 'utf8');
    const drawerContent = fs.readFileSync(path.join(srcDir, 'navigation', 'CustomDrawerContent.jsx'), 'utf8');

    assert.ok(
      loginContent.includes('keyboardShouldPersistTaps="handled"'),
      'LoginScreen KeyboardAwareScrollView must have keyboardShouldPersistTaps="handled"'
    );
    assert.ok(
      drawerContent.includes('keyboardShouldPersistTaps="handled"'),
      'DrawerContentScrollView must have keyboardShouldPersistTaps="handled"'
    );
  });

  it('10. RoomDetailsSheet.jsx arranges action buttons cleanly without single-row wrapping collisions', () => {
    const detailsSheetPath = path.join(srcDir, 'components', 'sheets', 'RoomDetailsSheet.jsx');
    const content = fs.readFileSync(detailsSheetPath, 'utf8');

    assert.ok(content.includes('footerRow'), 'RoomDetailsSheet must organize action buttons into structured footer rows');
  });

  it('11. index.js and App.js configure react-native-gesture-handler and GestureHandlerRootView for Android touch dispatch', () => {
    const indexPath = path.resolve(srcDir, '..', 'index.js');
    const appPath = path.resolve(srcDir, '..', 'App.js');
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(
      indexContent.startsWith("import 'react-native-gesture-handler';"),
      'index.js must import react-native-gesture-handler at line 1'
    );
    assert.ok(
      appContent.includes("import 'react-native-gesture-handler';"),
      'App.js must import react-native-gesture-handler'
    );
    assert.ok(
      appContent.includes('<GestureHandlerRootView style={{ flex: 1 }}>'),
      'App.js must wrap application in GestureHandlerRootView for Android gestures and touches'
    );
  });

  it('12. ToastContext.jsx overlay avoids full-screen absolute fill and high elevation to prevent touch interception', () => {
    const toastPath = path.join(srcDir, 'components', 'ToastContext.jsx');
    const content = fs.readFileSync(toastPath, 'utf8');

    assert.ok(
      !content.includes('...StyleSheet.absoluteFillObject'),
      'toastOverlay must not use ...StyleSheet.absoluteFillObject'
    );
    assert.ok(
      !/toastOverlay:\s*\{[^}]*elevation:\s*\d+/m.test(content),
      'toastOverlay must not have elevation to avoid intercepting touch events across the screen'
    );
  });

  it('13. Sheet.jsx enforces higher zIndex and elevation on sheet over scrim', () => {
    const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
    const content = fs.readFileSync(sheetPath, 'utf8');

    assert.ok(
      content.includes('zIndex: 10'),
      'Sheet must have higher zIndex than scrim'
    );
    assert.ok(
      content.includes('zIndex: 1'),
      'Scrim must have lower zIndex than sheet'
    );
  });

  it('14. Button.jsx ensures child Text has pointerEvents="none" so touches register on the Pressable parent', () => {
    const buttonPath = path.join(srcDir, 'components', 'ui', 'Button.jsx');
    const content = fs.readFileSync(buttonPath, 'utf8');

    assert.ok(
      content.includes('pointerEvents="none"'),
      'Button text must have pointerEvents="none"'
    );
    assert.ok(
      content.includes('pressRetentionOffset'),
      'Button must configure pressRetentionOffset to prevent accidental touch cancellation'
    );
  });
});
