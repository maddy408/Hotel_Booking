import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { Input, Segmented, FieldError, FormErrorBanner } from '../../components/ui/Field.jsx';
import { useUsers, useRoles, useCreateUser, useUpdateUser, useDeleteUser, useResetPassword } from '../../api/users';
import { useToast } from '../../components/ToastContext.jsx';
import { useFormValidation, isFilled, isValidEmail, isValidPhone } from '../../lib/validation.js';
import { colors, fonts, radii } from '../../theme/theme';

export default function UsersScreen() {
  const { data: users, isLoading, isError, error, refetch } = useUsers();
  const { data: roles } = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const resetPassword = useResetPassword();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const {
    errors,
    validate,
    clearError,
    clearAllErrors,
    setBackendErrors,
    registerRef,
    registerLayout,
    scrollRef,
    unmappedError,
  } = useFormValidation(['name', 'username', 'email', 'phone', 'password', 'role']);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const defaultRole = roles?.[0]?.code || 'receptionist';

  const openAdd = () => {
    clearAllErrors();
    setForm({
      name: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      role: defaultRole,
      is_active: true,
    });
  };

  const openEdit = (u) => {
    clearAllErrors();
    setForm({
      id: u.id,
      name: u.name || '',
      username: u.username || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role_code || defaultRole,
      is_active: !!u.is_active,
      password: '',
    });
  };

  const save = async () => {
    const trimmedName = (form.name || '').trim();
    const trimmedUsername = (form.username || '').trim();
    const trimmedEmail = (form.email || '').trim();
    const trimmedPhone = (form.phone || '').trim();
    const role = form.role || defaultRole;

    const isValid = validate({
      name: () => {
        if (!isFilled(trimmedName)) return 'Full name is required.';
        return null;
      },
      username: () => {
        if (!isFilled(trimmedUsername)) return 'Username is required.';
        return null;
      },
      email: () => {
        if (trimmedEmail && !isValidEmail(trimmedEmail)) return 'Please enter a valid email address.';
        return null;
      },
      phone: () => {
        if (trimmedPhone && !isValidPhone(trimmedPhone)) return 'Please enter a valid mobile number.';
        return null;
      },
      password: () => {
        if (!form.id) {
          if (!isFilled(form.password)) return 'Password is required.';
          if (form.password.length < 8) return 'Password must be at least 8 characters.';
        } else if (form.id && form.password && form.password.trim().length < 8) {
          return 'Password must be at least 8 characters.';
        }
        return null;
      },
      role: () => {
        if (!isFilled(role)) return 'Please select a role.';
        return null;
      },
    });

    if (!isValid) return;

    try {
      if (form.id) {
        const payload = {
          id: form.id,
          name: trimmedName,
          username: trimmedUsername,
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          role,
          isActive: form.is_active,
        };
        const trimmedPassword = form.password?.trim();
        if (trimmedPassword) {
          payload.password = trimmedPassword;
        }
        await updateUser.mutateAsync(payload);
        if (trimmedPassword) {
          try {
            await resetPassword.mutateAsync({ id: form.id, password: trimmedPassword });
          } catch {
            // Already updated in update payload
          }
        }
        toast('User updated successfully.');
      } else {
        await createUser.mutateAsync({
          name: trimmedName,
          username: trimmedUsername,
          email: form.email?.trim() || null,
          phone: form.phone?.trim() || null,
          role,
          password: form.password,
        });
        toast(`User ${trimmedUsername} created.`);
      }
      setForm(null);
    } catch (e) {
      const { unmapped } = setBackendErrors(e);
      if (unmapped) {
        toast(unmapped || 'Failed to save user.');
      }
    }
  };

  const handleDeleteUser = () => {
    if (!form?.id || deletingUserId) return;
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete user ${form.name} (${form.username})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingUserId(form.id);
            try {
              await deleteUser.mutateAsync(form.id);
              toast(`User ${form.username} deleted.`);
              setForm(null);
            } catch (e) {
              const msg = e.message || 'Failed to delete user.';
              toast(msg);
              Alert.alert('Cannot Delete User', msg);
            } finally {
              setDeletingUserId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen onRefresh={refetch}>
      <View style={styles.header}>
        <Text style={styles.title}>
          Users <Text style={styles.count}>{users?.length ?? ''}</Text>
        </Text>
        <Button title="+ Add user" variant="primary" size="sm" onPress={openAdd} />
      </View>

      {(users || []).map((u) => (
        <Pressable key={u.id} style={styles.row} onPress={() => openEdit(u)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.meta}>
              {u.username} · {u.role_name || u.role_code}
            </Text>
            {u.email ? <Text style={styles.subMeta}>{u.email}</Text> : null}
          </View>
          <View style={[styles.statusChip, { backgroundColor: u.is_active ? colors.successBg : colors.dangerBg }]}>
            <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 11, color: u.is_active ? colors.success : colors.danger }}>
              {u.is_active ? 'Active' : 'Disabled'}
            </Text>
          </View>
        </Pressable>
      ))}

      {form && (
        <Sheet scrollRef={scrollRef} onClose={() => setForm(null)}>
          <SheetHeader title={form.id ? `Edit ${form.name || 'User'}` : 'Add User'} onClose={() => setForm(null)} />
          <View style={styles.body}>
            <FormErrorBanner error={unmappedError} />

            <View style={styles.fieldWrap} onLayout={registerLayout('name')}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <Input
                ref={registerRef('name')}
                error={Boolean(errors.name)}
                placeholder="Full name"
                value={form.name}
                onChangeText={(v) => {
                  clearError('name');
                  setForm((p) => ({ ...p, name: v }));
                }}
              />
              <FieldError error={errors.name} />
            </View>

            <View style={styles.fieldWrap} onLayout={registerLayout('username')}>
              <Text style={styles.fieldLabel}>Username *</Text>
              <Input
                ref={registerRef('username')}
                error={Boolean(errors.username)}
                placeholder="Username"
                autoCapitalize="none"
                value={form.username}
                onChangeText={(v) => {
                  clearError('username');
                  setForm((p) => ({ ...p, username: v }));
                }}
              />
              <FieldError error={errors.username} />
            </View>

            <View style={styles.fieldWrap} onLayout={registerLayout('email')}>
              <Text style={styles.fieldLabel}>Email</Text>
              <Input
                ref={registerRef('email')}
                error={Boolean(errors.email)}
                placeholder="Email address (optional)"
                autoCapitalize="none"
                keyboardType="email-address"
                value={form.email}
                onChangeText={(v) => {
                  clearError('email');
                  setForm((p) => ({ ...p, email: v }));
                }}
              />
              <FieldError error={errors.email} />
            </View>

            <View style={styles.fieldWrap} onLayout={registerLayout('phone')}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <Input
                ref={registerRef('phone')}
                error={Boolean(errors.phone)}
                placeholder="Phone number (optional)"
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(v) => {
                  clearError('phone');
                  setForm((p) => ({ ...p, phone: v }));
                }}
              />
              <FieldError error={errors.phone} />
            </View>

            <View style={styles.fieldWrap} onLayout={registerLayout('password')}>
              <Text style={styles.fieldLabel}>
                {form.id ? 'Password (leave blank to keep current)' : 'Password * (min. 8 characters)'}
              </Text>
              <Input
                ref={registerRef('password')}
                error={Boolean(errors.password)}
                placeholder={form.id ? 'Enter new password (optional, min. 8 chars)' : 'Password'}
                secureTextEntry
                value={form.password}
                onChangeText={(v) => {
                  clearError('password');
                  setForm((p) => ({ ...p, password: v }));
                }}
              />
              <FieldError error={errors.password} />
            </View>

            {roles?.length ? (
              <View style={styles.fieldWrap} onLayout={registerLayout('role')}>
                <Text style={styles.fieldLabel}>Role *</Text>
                <Segmented
                  options={roles.map((r) => ({ value: r.code, label: r.name }))}
                  value={form.role}
                  onChange={(v) => {
                    clearError('role');
                    setForm((p) => ({ ...p, role: v }));
                  }}
                />
                <FieldError error={errors.role} />
              </View>
            ) : null}

            {form.id ? (
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Account Status</Text>
                <Segmented
                  options={[
                    { value: true, label: 'Active' },
                    { value: false, label: 'Disabled' },
                  ]}
                  value={form.is_active}
                  onChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                />
              </View>
            ) : null}

            <Button
              title={form.id ? 'Save Changes' : 'Save User'}
              variant="primary"
              size="lg"
              loading={createUser.isPending || updateUser.isPending || resetPassword.isPending}
              onPress={save}
              style={{ marginTop: 8 }}
            />

            {form.id ? (
              <Button
                title={deletingUserId === form.id ? 'Deleting User…' : 'Delete User'}
                variant="danger"
                size="lg"
                loading={deletingUserId === form.id}
                disabled={createUser.isPending || updateUser.isPending || deletingUserId === form.id}
                onPress={handleDeleteUser}
                style={{ marginTop: 4 }}
              />
            ) : null}
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading },
  count: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 8,
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  subMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  statusChip: { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  body: { padding: 16, gap: 12 },
  fieldWrap: { gap: 4 },
  fieldLabel: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.textSecondary },
});
