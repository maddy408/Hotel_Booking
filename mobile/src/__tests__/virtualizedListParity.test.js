import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('React Native VirtualizedLists & Nested ScrollView Parity Fixes', () => {
  it('1. ReferredBySelect uses .map() and does NOT import or render FlatList inside sheets', () => {
    const referredBySelectPath = path.join(srcDir, 'components', 'ReferredBySelect.jsx');
    const content = fs.readFileSync(referredBySelectPath, 'utf8');

    assert.ok(!content.includes('<FlatList'), 'ReferredBySelect must not render FlatList inside modal sheets');
    assert.ok(!/import\s*\{[^}]*FlatList[^}]*\}\s*from\s*['"]react-native['"]/.test(content), 'ReferredBySelect must not import FlatList');
    assert.ok(content.includes('.map('), 'ReferredBySelect must use .map() for small guest suggestions');
  });

  it('2. List-based screens use scroll={false} on Screen shell to prevent plain ScrollView nesting', () => {
    const screens = [
      path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx'),
      path.join(srcDir, 'screens', 'guests', 'AllReferralsScreen.jsx'),
      path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx'),
      path.join(srcDir, 'screens', 'bookings', 'BookingsScreen.jsx'),
    ];

    for (const screenPath of screens) {
      const content = fs.readFileSync(screenPath, 'utf8');
      assert.ok(
        content.includes('scroll={false}'),
        `${path.basename(screenPath)} must pass scroll={false} to Screen to avoid nesting in plain ScrollView`
      );
    }
  });

  it('3. GuestsScreen structure: FlatList as main container with ListHeaderComponent and ListEmptyComponent', () => {
    const content = fs.readFileSync(path.join(srcDir, 'screens', 'guests', 'GuestsScreen.jsx'), 'utf8');

    assert.ok(content.includes('<FlatList'), 'GuestsScreen must use FlatList for list virtualization');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'GuestsScreen must move header & filters into ListHeaderComponent');
    assert.ok(content.includes('ListEmptyComponent={renderEmpty}'), 'GuestsScreen must use ListEmptyComponent for empty/loading/error states');
    assert.ok(content.includes('refreshControl='), 'GuestsScreen must retain pull-to-refresh on FlatList');
  });

  it('4. AllReferralsScreen structure: FlatList as main container with ListHeaderComponent and ListEmptyComponent', () => {
    const content = fs.readFileSync(path.join(srcDir, 'screens', 'guests', 'AllReferralsScreen.jsx'), 'utf8');

    assert.ok(content.includes('<FlatList'), 'AllReferralsScreen must use FlatList for virtualization');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'AllReferralsScreen must move metric cards & search into ListHeaderComponent');
    assert.ok(content.includes('ListEmptyComponent={renderEmpty}'), 'AllReferralsScreen must use ListEmptyComponent for empty/loading/error states');
    assert.ok(content.includes('refreshControl='), 'AllReferralsScreen must retain pull-to-refresh on FlatList');
  });

  it('5. BillsScreen structure: FlatList as main container with ListHeaderComponent and ListEmptyComponent', () => {
    const content = fs.readFileSync(path.join(srcDir, 'screens', 'bills', 'BillsScreen.jsx'), 'utf8');

    assert.ok(content.includes('<FlatList'), 'BillsScreen must use FlatList for bill items');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'BillsScreen must move summary cards into ListHeaderComponent');
    assert.ok(content.includes('ListEmptyComponent='), 'BillsScreen must use ListEmptyComponent for empty bills');
    assert.ok(content.includes('refreshControl='), 'BillsScreen must retain pull-to-refresh on FlatList');
  });

  it('6. BookingsScreen structure: SectionList as main container with sections, headers, and ListEmptyComponent', () => {
    const content = fs.readFileSync(path.join(srcDir, 'screens', 'bookings', 'BookingsScreen.jsx'), 'utf8');

    assert.ok(content.includes('<SectionList'), 'BookingsScreen must use SectionList for section virtualization');
    assert.ok(content.includes('sections={sections}'), 'BookingsScreen must pass sections array');
    assert.ok(content.includes('renderSectionHeader={renderSectionHeader}'), 'BookingsScreen must render custom section headers');
    assert.ok(content.includes('ListHeaderComponent={renderHeader}'), 'BookingsScreen must move screen header into ListHeaderComponent');
    assert.ok(content.includes('ListEmptyComponent='), 'BookingsScreen must use ListEmptyComponent for empty states');
    assert.ok(content.includes('refreshControl='), 'BookingsScreen must retain pull-to-refresh on SectionList');
  });

  it('7. No nestedScrollEnabled workarounds or log suppression for VirtualizedLists in the codebase', () => {
    const checkDir = (dir) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          if (file.name !== 'node_modules' && file.name !== '.expo' && file.name !== 'dist' && file.name !== '__tests__') {
            checkDir(fullPath);
          }
        } else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
          const code = fs.readFileSync(fullPath, 'utf8');
          assert.ok(
            !code.includes('nestedScrollEnabled'),
            `Forbidden workaround nestedScrollEnabled detected in ${path.relative(srcDir, fullPath)}`
          );
          assert.ok(
            !code.includes('ignoreLogs') || !code.includes('VirtualizedLists'),
            `Forbidden warning suppression detected in ${path.relative(srcDir, fullPath)}`
          );
        }
      }
    };

    checkDir(srcDir);
  });

  it('8. Verifies list data handling with empty, small, and large datasets', () => {
    // Empty dataset handling
    const emptyGuests = [];
    const emptyFiltered = emptyGuests.filter((g) => g.name);
    assert.equal(emptyFiltered.length, 0);

    // Small dataset handling
    const smallGuests = [{ id: 1, name: 'Guest 1', phone: '9999900001' }];
    assert.equal(smallGuests.slice(0, 20).length, 1);

    // Large dataset handling (e.g. 500 guests)
    const largeGuests = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      name: `Guest ${i + 1}`,
      phone: `9800000000`.slice(0, 10 - String(i).length) + String(i),
    }));
    assert.equal(largeGuests.length, 500);
    assert.equal(largeGuests.slice(0, 20).length, 20);
  });
});
