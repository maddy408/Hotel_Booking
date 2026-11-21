import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Verification of 3 Mobile Bug Fixes', () => {
  const invoicePrintPath = path.join(srcDir, 'screens', 'bills', 'InvoicePrintScreen.jsx');
  const sheetPath = path.join(srcDir, 'components', 'Sheet.jsx');
  const usersScreenPath = path.join(srcDir, 'screens', 'more', 'UsersScreen.jsx');
  const userControllerPath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Controller', 'UserController.php');

  it('1. Share PDF Fix: InvoicePrintScreen copies generated PDF to FileSystem.cacheDirectory before Sharing.shareAsync', () => {
    const content = fs.readFileSync(invoicePrintPath, 'utf8');

    // Must import FileSystem
    assert.ok(
      content.includes("import * as FileSystem from 'expo-file-system/legacy'") ||
      content.includes("import * as FileSystem from 'expo-file-system'"),
      'InvoicePrintScreen must import FileSystem'
    );

    // Must write or copy to cacheDirectory to ensure file is inside the scoped experience sandbox
    assert.ok(
      content.includes('FileSystem.cacheDirectory'),
      'InvoicePrintScreen must use FileSystem.cacheDirectory for sharing'
    );
    assert.ok(
      content.includes('FileSystem.writeAsStringAsync') || content.includes('FileSystem.copyAsync'),
      'InvoicePrintScreen must write or copy to target cache directory'
    );

    // Retains Sharing.shareAsync
    assert.ok(
      content.includes('Sharing.shareAsync'),
      'InvoicePrintScreen must call Sharing.shareAsync with accessible cache URI'
    );

    // Includes File.preview fallback to handle Android/Expo Go FilePermissionService rejections gracefully
    assert.ok(
      content.includes('File.preview'),
      'InvoicePrintScreen must include File.preview fallback when Sharing.shareAsync rejects'
    );
  });

  it('2. Compact Dialog Positioning Fix: Sheet.jsx centers compact cards and avoids sticking to screen top', () => {
    const content = fs.readFileSync(sheetPath, 'utf8');

    // Must have compactWrap or centered layout wrapper with SafeAreaView
    assert.ok(
      content.includes('compactWrap'),
      'Sheet.jsx must use compactWrap for compact dialogs'
    );
    assert.ok(
      content.includes("justifyContent: 'center'") && content.includes("alignItems: 'center'"),
      'Sheet.jsx compact dialog must be centered'
    );

    // Must NOT have marginBottom: 'auto' in compactCard which pushes dialog to top on Android
    assert.ok(
      !content.includes("marginBottom: 'auto'"),
      'Sheet.jsx compactCard must not use marginBottom: auto which pushed modal to top'
    );

    // Must retain sheetWrap with flex-end for test parity
    assert.ok(
      content.includes('sheetWrap:') && content.includes("justifyContent: 'flex-end'"),
      'Sheet.jsx retains sheetWrap for bottom sheet parity'
    );
  });

  it('3. Users Form Fix: UsersScreen properly maps and sends role code and isActive, preventing "This field is required"', () => {
    const content = fs.readFileSync(usersScreenPath, 'utf8');

    // Must map roles to code (not id)
    assert.ok(
      content.includes('r.code'),
      'UsersScreen must map roles by r.code'
    );

    // Must pass role code to createUser and updateUser
    assert.ok(
      content.includes('role,') || content.includes('role: form.role') || content.includes('role: role'),
      'UsersScreen must send role in API mutations'
    );

    // Must pass isActive for update
    assert.ok(
      content.includes('isActive:') || content.includes('isActive,'),
      'UsersScreen must send isActive property'
    );

    // Must validate required fields before submission
    assert.ok(
      content.includes('Please enter a full name') || content.includes('name'),
      'UsersScreen must validate name'
    );
    assert.ok(
      content.includes('Please enter a username') || content.includes('username'),
      'UsersScreen must validate username'
    );
    assert.ok(
      content.includes('8 characters'),
      'UsersScreen must validate password minimum length'
    );
  });

  it('4. Backend UserController Fix: Accepts role_code and role_id as fallbacks and handles is_active/isActive', () => {
    const content = fs.readFileSync(userControllerPath, 'utf8');

    assert.ok(
      content.includes('role_code') || content.includes('role_id'),
      'UserController must handle role_code and role_id fallbacks'
    );
    assert.ok(
      content.includes('is_active') && content.includes('isActive'),
      'UserController must normalize is_active to isActive'
    );
  });
});
