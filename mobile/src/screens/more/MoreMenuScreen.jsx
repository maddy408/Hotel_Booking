import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen from '../../components/ui/Screen.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ReportsIcon, RoomMasterIcon, UsersIcon, SettingsIcon, LogoutIcon, ChevronRightIcon } from '../../components/Icons.jsx';
import { colors, fonts, radii } from '../../theme/theme';

/** Mobile adaptation of the web's hamburger drawer menu — same destinations and role gating. */
export default function MoreMenuScreen({ navigation }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAdminOrManager = ['admin', 'manager'].includes(user?.role);

  const items = [
    { key: 'Reports', label: 'Reports', Icon: ReportsIcon, show: isAdminOrManager },
    { key: 'RoomMaster', label: 'Room Master', Icon: RoomMasterIcon, show: isAdminOrManager },
    { key: 'Users', label: 'Users', Icon: UsersIcon, show: isAdmin },
    { key: 'SettingsScreen', label: 'Settings', Icon: SettingsIcon, show: isAdminOrManager },
  ].filter((i) => i.show);

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <Screen scroll={false}>
      <View style={styles.userCard}>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userRole}>{user?.role_name || user?.role}</Text>
      </View>

      <View style={styles.list}>
        {items.map(({ key, label, Icon }) => (
          <Pressable key={key} style={styles.row} onPress={() => navigation.navigate(key)}>
            <Icon color={colors.primary} size={19} />
            <Text style={styles.rowLabel}>{label}</Text>
            <ChevronRightIcon />
          </Pressable>
        ))}
      </View>

      <Pressable style={[styles.row, styles.logoutRow]} onPress={confirmLogout}>
        <LogoutIcon color={colors.danger} size={18} />
        <Text style={[styles.rowLabel, { color: colors.danger }]}>Log out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, marginBottom: 16 },
  userName: { fontFamily: fonts.display, fontSize: 17, color: colors.heading },
  userRole: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  list: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  rowLabel: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 14.5, color: colors.heading },
  logoutRow: { marginTop: 16, backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, borderBottomWidth: 0 },
});
