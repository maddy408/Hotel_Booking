import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { Input, Segmented } from '../../components/ui/Field.jsx';
import { useUsers, useRoles, useCreateUser, useUpdateUser } from '../../api/users';
import { useToast } from '../../components/ToastContext.jsx';
import { colors, fonts, radii } from '../../theme/theme';

/** Simplified adaptation of web's Users.jsx + UserFormSheet (add/edit without password reset UI yet). */
export default function UsersScreen() {
  const { data: users, isLoading, isError, error, refetch } = useUsers();
  const { data: roles } = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const toast = useToast();
  const [form, setForm] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const openAdd = () => setForm({ name: '', username: '', password: '', role_id: roles?.[0]?.id, is_active: true });
  const openEdit = (u) => setForm({ ...u, password: '' });

  const save = async () => {
    try {
      if (form.id) {
        await updateUser.mutateAsync({ id: form.id, name: form.name, username: form.username, email: form.email, role_id: form.role_id, is_active: form.is_active });
      } else {
        await createUser.mutateAsync({ name: form.name, username: form.username, password: form.password, role_id: form.role_id });
      }
      setForm(null);
      toast('User saved.');
    } catch (e) { toast(e.message); }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Users <Text style={styles.count}>{users?.length ?? ''}</Text></Text>
        <Button title="+ Add user" variant="primary" size="sm" onPress={openAdd} />
      </View>

      {(users || []).map((u) => (
        <Pressable key={u.id} style={styles.row} onPress={() => openEdit(u)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.name}</Text>
            <Text style={styles.meta}>{u.username} · {u.role_name}</Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: u.is_active ? colors.successBg : colors.dangerBg }]}>
            <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 11, color: u.is_active ? colors.success : colors.danger }}>
              {u.is_active ? 'Active' : 'Disabled'}
            </Text>
          </View>
        </Pressable>
      ))}

      {form && (
        <Sheet onClose={() => setForm(null)}>
          <SheetHeader title={form.id ? 'Edit User' : 'Add User'} onClose={() => setForm(null)} />
          <View style={styles.body}>
            <Input placeholder="Full name" value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} />
            <Input placeholder="Username" autoCapitalize="none" value={form.username} onChangeText={(v) => setForm((p) => ({ ...p, username: v }))} />
            {!form.id ? <Input placeholder="Password" secureTextEntry value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} /> : null}
            {roles?.length ? (
              <Segmented
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                value={form.role_id}
                onChange={(v) => setForm((p) => ({ ...p, role_id: v }))}
              />
            ) : null}
            <Button title="Save" variant="primary" size="lg" loading={createUser.isPending || updateUser.isPending} onPress={save} />
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
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8 },
  name: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  statusChip: { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  body: { padding: 16, gap: 12 },
});
