import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
      {/* Header Profile Card - respects top safe area */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={styles.headerTop}>
          <View style={styles.crestWrap}>
            <CrestIcon color="#FFFFFF" size={24} />
          </View>
          <View style={styles.hotelTitleWrap}>
            <Text style={styles.hotelTitle}>KKK Lodge</Text>
            <Text style={styles.hotelSubtitle}>Front Desk System</Text>
          </View>
        </View>
        <View style={styles.userInfoWrap}>
          <Text style={styles.userName}>{user?.name || 'Staff'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{(user?.role_name || user?.role || 'User').toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Non-scrollable flexbox body: keyboardShouldPersistTaps="handled" */}
      <View style={styles.body}>
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
                  navigation.navigate('MainTabs', {
                    screen: tabTarget,
                    params: tabTarget === 'Bills' ? { screen: 'BillsHome' } : undefined,
                  });
                }}
              >
                <Icon color={isActive ? colors.primary : colors.text} size={19} />
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
                <Icon color={colors.text} size={19} />
                <Text style={styles.menuLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Logout Footer - anchored at bottom of available sidebar area, fully visible above Android system navigation */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
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
    justifyContent: 'space-between',
  },
  header: {
    backgroundColor: colors.header,
    paddingBottom: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  crestWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hotelTitleWrap: {
    flex: 1,
  },
  hotelTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  hotelSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  userInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13.5,
    color: 'rgba(255, 255, 255, 0.95)',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontFamily: fonts.monoMedium,
    fontSize: 9.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  body: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  section: {
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  sectionHeader: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    paddingHorizontal: 8,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    marginBottom: 2,
  },
  menuItemActive: {
    backgroundColor: colors.secondaryLight,
  },
  menuLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.text,
  },
  menuLabelActive: {
    fontFamily: fonts.bodySemibold,
    color: colors.primary,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: '#FEF2F2',
  },
  logoutText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13.5,
    color: colors.danger,
    fontWeight: '600',
  },
});
