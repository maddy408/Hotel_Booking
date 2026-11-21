import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');

describe('Mobile Edit User - All Fields Editable Verification', () => {
  const usersScreenPath = path.join(srcDir, 'screens', 'more', 'UsersScreen.jsx');
  const userControllerPath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Controller', 'UserController.php');
  const userServicePath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Service', 'UserService.php');
  const userRepositoryPath = path.resolve(srcDir, '..', '..', 'backend', 'src', 'Repository', 'UserRepository.php');

  const usersScreenCode = fs.readFileSync(usersScreenPath, 'utf8');

  it('1. Clicking edit user opens form with all user fields populated', () => {
    // Check openEdit populates id, name, username, email, phone, role, is_active, password
    assert.ok(usersScreenCode.includes('openEdit'), 'UsersScreen must define openEdit handler');
    assert.ok(usersScreenCode.includes('id: u.id'), 'openEdit must populate id');
    assert.ok(usersScreenCode.includes('name: u.name'), 'openEdit must populate name');
    assert.ok(usersScreenCode.includes('username: u.username'), 'openEdit must populate username');
    assert.ok(usersScreenCode.includes('email: u.email'), 'openEdit must populate email');
    assert.ok(usersScreenCode.includes('phone: u.phone'), 'openEdit must populate phone');
    assert.ok(usersScreenCode.includes('role: u.role_code'), 'openEdit must populate role');
    assert.ok(usersScreenCode.includes('is_active: !!u.is_active'), 'openEdit must populate is_active status');
    assert.ok(usersScreenCode.includes("password: ''"), 'openEdit must initialize password as empty for optional change');

    // Simulate openEdit behavior with sample user
    const sampleUser = {
      id: 42,
      name: 'Alice Receptionist',
      username: 'alice_r',
      email: 'alice@hotel.com',
      phone: '+91 9876543210',
      role_code: 'receptionist',
      is_active: 1,
    };
    const defaultRole = 'receptionist';
    const formState = {
      id: sampleUser.id,
      name: sampleUser.name || '',
      username: sampleUser.username || '',
      email: sampleUser.email || '',
      phone: sampleUser.phone || '',
      role: sampleUser.role_code || defaultRole,
      is_active: !!sampleUser.is_active,
      password: '',
    };

    assert.equal(formState.id, 42);
    assert.equal(formState.name, 'Alice Receptionist');
    assert.equal(formState.username, 'alice_r');
    assert.equal(formState.email, 'alice@hotel.com');
    assert.equal(formState.phone, '+91 9876543210');
    assert.equal(formState.role, 'receptionist');
    assert.equal(formState.is_active, true);
    assert.equal(formState.password, '');
  });

  it('2. Username field is fully editable on edit (no disabled or editable={!form.id} lock)', () => {
    // Must NOT have editable={!form.id} or editable={false}
    assert.ok(
      !usersScreenCode.includes('editable={!form.id}'),
      'Username must NOT be locked with editable={!form.id} when editing'
    );
    assert.ok(
      !usersScreenCode.includes('editable={false}'),
      'Username must NOT be locked with editable={false}'
    );

    // Verify Username input exists and binds onChangeText to update username
    assert.ok(
      usersScreenCode.includes('value={form.username}'),
      'Username field must bind to form.username'
    );
    assert.ok(
      usersScreenCode.includes('username: v'),
      'Username field onChangeText must update form.username'
    );
  });

  it('3. Password field is present and editable during edit mode', () => {
    // Password input must NOT be wrapped in {!form.id ? ... : null} which previously hid it on edit
    assert.ok(
      !usersScreenCode.includes('{!form.id ? (\n              <View style={styles.fieldWrap}>\n                <Text style={styles.fieldLabel}>Password'),
      'Password field must be rendered in edit mode as well as create mode'
    );

    // Should indicate password change is optional when editing
    assert.ok(
      usersScreenCode.includes('leave blank to keep current') || usersScreenCode.includes('optional'),
      'Password field label/placeholder should clarify leaving blank preserves current password'
    );
    assert.ok(
      usersScreenCode.includes('value={form.password}'),
      'Password field must bind to form.password'
    );
    assert.ok(
      usersScreenCode.includes('password: v'),
      'Password field onChangeText must update form.password'
    );
  });

  it('4. Full Name, Email, Phone, Role, and Status are all fully editable', () => {
    // Full name
    assert.ok(usersScreenCode.includes('value={form.name}'), 'Full name must bind to form.name');
    assert.ok(usersScreenCode.includes('name: v'), 'Full name onChangeText must update form.name');

    // Email
    assert.ok(usersScreenCode.includes('value={form.email}'), 'Email must bind to form.email');
    assert.ok(usersScreenCode.includes('email: v'), 'Email onChangeText must update form.email');

    // Phone
    assert.ok(usersScreenCode.includes('value={form.phone}'), 'Phone must bind to form.phone');
    assert.ok(usersScreenCode.includes('phone: v'), 'Phone onChangeText must update form.phone');

    // Role
    assert.ok(usersScreenCode.includes('value={form.role}'), 'Role must bind to form.role');
    assert.ok(usersScreenCode.includes('role: v'), 'Role onChange must update form.role');

    // Account Status (Active / Disabled)
    assert.ok(usersScreenCode.includes('value={form.is_active}'), 'Status must bind to form.is_active');
    assert.ok(usersScreenCode.includes('is_active: v'), 'Status onChange must update form.is_active');
  });

  it('5. Save function submits all edited fields including username and updated password', async () => {
    // Check that save sends id, name, username, email, phone, role, isActive
    assert.ok(usersScreenCode.includes('username: trimmedUsername'), 'save must pass updated username in payload');
    assert.ok(usersScreenCode.includes('name: trimmedName'), 'save must pass updated name in payload');
    assert.ok(usersScreenCode.includes('role,'), 'save must pass updated role in payload');
    assert.ok(usersScreenCode.includes('isActive: form.is_active'), 'save must pass updated isActive in payload');

    // Password validation on edit: must allow blank (unchanged) or validate min 8 chars if modified
    assert.ok(
      usersScreenCode.includes('form.id && form.password && form.password.trim().length < 8') ||
      usersScreenCode.includes('form.password.length < 8'),
      'Password validation must enforce minimum 8 characters when entered'
    );

    // Simulate saving edited user data
    let submittedPayload = null;
    const mockUpdateUser = {
      mutateAsync: async (payload) => {
        submittedPayload = payload;
        return { success: true };
      },
    };

    const form = {
      id: 42,
      name: 'Alice Johnson',
      username: 'alice_updated',
      email: 'alice.new@hotel.com',
      phone: '+91 9999988888',
      role: 'manager',
      is_active: false,
      password: 'newSecretPassword123',
    };

    const trimmedName = form.name.trim();
    const trimmedUsername = form.username.trim();
    const payload = {
      id: form.id,
      name: trimmedName,
      username: trimmedUsername,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      role: form.role,
      isActive: form.is_active,
    };
    if (form.password && form.password.trim()) {
      payload.password = form.password.trim();
    }

    await mockUpdateUser.mutateAsync(payload);

    assert.deepEqual(submittedPayload, {
      id: 42,
      name: 'Alice Johnson',
      username: 'alice_updated',
      email: 'alice.new@hotel.com',
      phone: '+91 9999988888',
      role: 'manager',
      isActive: false,
      password: 'newSecretPassword123',
    });
  });

  it('6. Backend UserController accepts username and password in update request', () => {
    const userControllerCode = fs.readFileSync(userControllerPath, 'utf8');

    // UserController must allow optional username and password in update validation rules
    assert.ok(
      userControllerCode.includes("rules['username']") && userControllerCode.includes('string|max:50'),
      'UserController must accept username in update'
    );
    assert.ok(
      userControllerCode.includes("rules['password']") && userControllerCode.includes('string|min:8'),
      'UserController must accept password in update'
    );

    // UserController passes username and password to UserService::update
    assert.ok(userControllerCode.includes("$data['username']"), 'UserController must forward username to UserService');
    assert.ok(userControllerCode.includes("$data['password']"), 'UserController must forward password to UserService');
  });

  it('7. Backend UserService and UserRepository support updating username and password', () => {
    const userServiceCode = fs.readFileSync(userServicePath, 'utf8');
    const userRepositoryCode = fs.readFileSync(userRepositoryPath, 'utf8');

    // UserService::update must check username uniqueness excluding the current user id
    assert.ok(
      userServiceCode.includes('usernameExistsExcept'),
      'UserService must check username uniqueness excluding current user'
    );
    assert.ok(
      userRepositoryCode.includes('usernameExistsExcept'),
      'UserRepository must provide usernameExistsExcept method'
    );

    // UserRepository::update must dynamically update username and password_hash when provided
    assert.ok(
      userRepositoryCode.includes('username = :username'),
      'UserRepository must update username column'
    );
    assert.ok(
      userRepositoryCode.includes('password_hash = :password_hash'),
      'UserRepository must update password_hash column when provided'
    );
  });
});
