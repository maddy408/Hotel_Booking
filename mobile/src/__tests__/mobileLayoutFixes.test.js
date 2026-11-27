import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');
const frontendStylesDir = path.resolve(srcDir, '..', '..', 'frontend', 'src', 'styles');

describe('Mobile Layout Fixes Verification Suite', () => {
  it('1. Rooms screen removes unwanted white space above bottom navigation and uses available height properly', () => {
    const roomsContent = fs.readFileSync(path.join(srcDir, 'screens', 'rooms', 'RoomsScreen.jsx'), 'utf8');
    const screenContent = fs.readFileSync(path.join(srcDir, 'components', 'ui', 'Screen.jsx'), 'utf8');

    // RoomsScreen explicitly passes edges={['left', 'right']} to avoid bottom padding on top of tab bar
    assert.ok(
      roomsContent.includes("edges={['left', 'right']}"),
      'RoomsScreen must pass edges={[\'left\', \'right\']} to avoid double bottom safe area padding above tabs'
    );

    // Screen component resolves edges and omits 'bottom' when inside root tab screens
    assert.ok(
      screenContent.includes("ROOT_TAB_SCREENS"),
      'Screen must know root tab screens to handle bottom navigation safe area properly'
    );
    assert.ok(
      screenContent.includes("styles.scrollContent"),
      'Screen must include scrollContent style on ScrollView'
    );
    assert.ok(
      screenContent.includes("flexGrow: 1"),
      'Screen content container must have flexGrow: 1 to use available screen height properly'
    );
  });

  it('2. CustomDrawerContent uses flexbox, is NOT scrollable, and does not wrap in DrawerContentScrollView', () => {
    const drawerContent = fs.readFileSync(path.join(srcDir, 'navigation', 'CustomDrawerContent.jsx'), 'utf8');

    // DrawerContentScrollView should NOT be used
    assert.ok(
      !drawerContent.includes('<DrawerContentScrollView'),
      'Sidebar must NOT be scrollable; DrawerContentScrollView must not be used'
    );

    // Root container must use flexbox
    assert.ok(
      drawerContent.includes("justifyContent: 'space-between'"),
      'Sidebar root container must use flexbox with space-between to position content and footer'
    );

    // Navigation body must be flex: 1
    assert.ok(
      drawerContent.includes("flex: 1") && drawerContent.includes("justifyContent: 'flex-start'"),
      'Sidebar body must use flexbox layout'
    );
  });

  it('3. Sidebar Logout is positioned at the bottom and respects Android safe-area insets', () => {
    const drawerContent = fs.readFileSync(path.join(srcDir, 'navigation', 'CustomDrawerContent.jsx'), 'utf8');

    // Must import useSafeAreaInsets
    assert.ok(
      drawerContent.includes('useSafeAreaInsets'),
      'CustomDrawerContent must import useSafeAreaInsets for safe-area compliance'
    );

    // Footer must account for insets.bottom above Android system navigation
    assert.ok(
      drawerContent.includes('insets.bottom'),
      'Footer must respect insets.bottom to ensure visibility above Android system navigation bar'
    );

    // Top header must account for insets.top
    assert.ok(
      drawerContent.includes('insets.top'),
      'Header must respect insets.top for notch and status bar safe areas'
    );
  });

  it('4. Frontend mobile styles prevent unwanted bottom nav white space and maintain web layout', () => {
    const baseCss = fs.readFileSync(path.join(frontendStylesDir, 'base.css'), 'utf8');

    // Check padding-bottom in @media (max-width: 900px)
    assert.ok(
      baseCss.includes('calc(60px + env(safe-area-inset-bottom, 0px))'),
      'Frontend main-content-wrap must match bottom nav height without adding 28px of white space'
    );

    // Check non-scrollable drawer
    assert.ok(
      baseCss.includes('.drawer-nav') && baseCss.includes('overflow: hidden'),
      'Frontend mobile drawer-nav must not be scrollable'
    );

    // Check footer safe-area padding
    assert.ok(
      baseCss.includes('calc(12px + env(safe-area-inset-bottom, 0px))'),
      'Frontend drawer-footer must respect safe-area-inset-bottom'
    );
  });
});
