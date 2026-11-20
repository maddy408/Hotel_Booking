import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useAuth } from '../auth/AuthContext.jsx';
import {
  RoomsIcon,
  BookingsIcon,
  DailyOpsIcon,
  GuestsIcon,
  BillsIcon,
  ReportsIcon,
  RoomMasterIcon,
  UsersIcon,
  SettingsIcon,
  LogoutIcon,
  CrestIcon,
} from '../components/Icons.jsx';
import { colors, fonts, radii } from '../theme/theme';

export default function CustomDrawerContent(props) {
  const { state, navigation } = props;
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isAdminOrManager = ['admin', 'manager'].includes(user?.role);
  const activeRouteName = state.routeNames[state.index];

  const mainNavItems = [
    { name: 'RoomsTab', label: 'Rooms', Icon: RoomsIcon, tabTarget: 'Rooms' },
    { name: 'BookingsTab', label: 'Bookings', Icon: BookingsIcon, tabTarget: 'Bookings' },
    { name: 'DailyOpsTab', label: 'Daily Ops', Icon: DailyOpsIcon, tabTarget: 'DailyOps' },
    { name: 'GuestsTab', label: 'Guests', Icon: GuestsIcon, tabTarget: 'Guests' },
    { name: 'BillsTab', label: 'Bills', Icon: BillsIcon, tabTarget: 'Bills' },
  ];

  const managementItems = [
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
    <View style={styles.container}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Profile Card */}
        <View style={styles.header}>
          <View style={styles.crestWrap}>
            <CrestIcon color="#FFFFFF" size={26} />
          </View>
          <Text style={styles.hotelTitle}>Tamarind Court</Text>
          <View style={styles.userInfoWrap}>
            <Text style={styles.userName}>{user?.name || 'Staff'}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{(user?.role_name || user?.role || 'User').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Main Navigation */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>MAIN NAVIGATION</Text>
          {mainNavItems.map(({ name, label, Icon, tabTarget }) => {
            const isActive = activeRouteName === name;
            return (
              <Pressable
                key={name}
                style={[styles.menuItem, isActive ? styles.menuItemActive : null]}
                onPress={() => {
                  navigation.closeDrawer();
                  navigation.navigate('MainTabs', { screen: tabTarget });
                }}
              >
                <Icon color={isActive ? colors.primary : colors.text} size={20} />
                <Text style={[styles.menuLabel, isActive ? styles.menuLabelActive : null]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Management & More */}
        {managementItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>MANAGEMENT</Text>
            {managementItems.map(({ key, label, Icon }) => (
              <Pressable
                key={key}
                style={styles.menuItem}
                onPress={() => {
                  navigation.closeDrawer();
                  navigation.navigate('MainTabs', {
                    screen: 'More',
                    params: { screen: key },
                  });
                }}
              >
                <Icon color={colors.text} size={20} />
                <Text style={styles.menuLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </DrawerContentScrollView>

      {/* Logout Footer */}
      <View style={styles.footer}>
        <Pressable style={styles.logoutBtn} onPress={confirmLogout}>
          <LogoutIcon color={colors.danger} size={18} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    paddingTop: 0,
  },
  header: {
    backgroundColor: colors.header,
    paddingTop: 48,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  crestWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  hotelTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  userInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  userName: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    color: colors.textSecondary,
    marginBottom: 8,
    paddingHorizontal: 8,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    marginBottom: 2,
  },
  menuItemActive: {
    backgroundColor: colors.secondaryLight,
  },
  menuLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14.5,
    color: colors.text,
  },
  menuLabelActive: {
    fontFamily: fonts.bodySemibold,
    color: colors.primary,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    color: colors.danger,
    fontWeight: '600',
  },
});
