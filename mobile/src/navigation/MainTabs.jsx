import { Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getFocusedRouteNameFromRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext.jsx';
import { colors, fonts } from '../theme/theme';
import {
  RoomsIcon,
  BookingsIcon,
  DailyOpsIcon,
  GuestsIcon,
  BillsIcon,
  MoreIcon,
  MenuIcon,
} from '../components/Icons.jsx';
import BackButton from '../components/ui/BackButton.jsx';

import RoomsScreen from '../screens/rooms/RoomsScreen.jsx';
import BookingsScreen from '../screens/bookings/BookingsScreen.jsx';
import DailyOpsScreen from '../screens/dailyops/DailyOpsScreen.jsx';
import GuestsScreen from '../screens/guests/GuestsScreen.jsx';
import GuestDetailsScreen from '../screens/guests/GuestDetailsScreen.jsx';
import AllReferralsScreen from '../screens/guests/AllReferralsScreen.jsx';
import BillsScreen from '../screens/bills/BillsScreen.jsx';
import InvoicePrintScreen from '../screens/bills/InvoicePrintScreen.jsx';
import MoreMenuScreen from '../screens/more/MoreMenuScreen.jsx';
import ReportsScreen from '../screens/more/ReportsScreen.jsx';
import RoomMasterScreen from '../screens/more/RoomMasterScreen.jsx';
import UsersScreen from '../screens/more/UsersScreen.jsx';
import SettingsScreen from '../screens/more/SettingsScreen.jsx';
import NoPermissionScreen from '../screens/NoPermissionScreen.jsx';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function DrawerButton() {
  const navigation = useNavigation();
  return (
    <Pressable
      onPress={() => navigation.openDrawer()}
      hitSlop={12}
      style={{ marginLeft: 4, marginRight: 8, padding: 6 }}
      accessibilityLabel="Open Navigation Drawer"
    >
      <MenuIcon color="#FFFFFF" size={22} />
    </Pressable>
  );
}

const headerOptions = {
  headerStyle: { backgroundColor: colors.header },
  headerTintColor: colors.headerText,
  headerTitleStyle: { fontFamily: fonts.displaySemibold, fontSize: 17 },
  headerLeft: () => <DrawerButton />,
};

function RoomsStack() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="RoomsHome" component={RoomsScreen} options={{ title: 'Rooms' }} />
    </Stack.Navigator>
  );
}

function BookingsStack() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="BookingsHome" component={BookingsScreen} options={{ title: 'Bookings' }} />
    </Stack.Navigator>
  );
}

function DailyOpsStack() {
  const { user } = useAuth();
  const allowed = ['admin', 'manager', 'receptionist'].includes(user?.role);
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="DailyOpsHome" component={allowed ? DailyOpsScreen : NoPermissionScreen} options={{ title: 'Daily Ops' }} />
    </Stack.Navigator>
  );
}

function GuestsStack() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="GuestsHome" component={GuestsScreen} options={{ title: 'Guests' }} />
      <Stack.Screen
        name="GuestDetails"
        component={GuestDetailsScreen}
        options={({ navigation }) => ({
          title: 'Guest',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="GuestsHome" />,
        })}
      />
      <Stack.Screen
        name="AllReferrals"
        component={AllReferralsScreen}
        options={({ navigation }) => ({
          title: 'Referrals',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="GuestsHome" />,
        })}
      />
    </Stack.Navigator>
  );
}

function BillsStack() {
  return (
    <Stack.Navigator initialRouteName="BillsHome" screenOptions={headerOptions}>
      <Stack.Screen name="BillsHome" component={BillsScreen} options={{ title: 'Bills' }} />
      <Stack.Screen
        name="InvoicePrint"
        component={InvoicePrintScreen}
        options={({ navigation }) => ({
          title: 'Invoice',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="BillsHome" />,
        })}
      />
    </Stack.Navigator>
  );
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'More' }} />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={({ navigation }) => ({
          title: 'Reports',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="MoreMenu" />,
        })}
      />
      <Stack.Screen
        name="RoomMaster"
        component={RoomMasterScreen}
        options={({ navigation }) => ({
          title: 'Room Master',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="MoreMenu" />,
        })}
      />
      <Stack.Screen
        name="Users"
        component={UsersScreen}
        options={({ navigation }) => ({
          title: 'Users',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="MoreMenu" />,
        })}
      />
      <Stack.Screen
        name="SettingsScreen"
        component={SettingsScreen}
        options={({ navigation }) => ({
          title: 'Settings',
          headerLeft: () => <BackButton navigation={navigation} fallbackRoute="MoreMenu" />,
        })}
      />
    </Stack.Navigator>
  );
}

const rootScreens = ['RoomsHome', 'BookingsHome', 'DailyOpsHome', 'GuestsHome', 'BillsHome', 'MoreMenu'];

function getTabBarStyle(route, insets) {
  const bottomPadding = Math.max(insets.bottom, 8);
  const tabHeight = 54 + bottomPadding;
  const baseStyle = {
    backgroundColor: colors.header,
    borderTopWidth: 0,
    height: tabHeight,
    paddingBottom: bottomPadding,
    paddingTop: 6,
  };

  const routeName = getFocusedRouteNameFromRoute(route);
  if (routeName && !rootScreens.includes(routeName)) {
    return { display: 'none' };
  }
  return baseStyle;
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: getTabBarStyle(route, insets),
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.55)',
        tabBarActiveBackgroundColor: 'rgba(255, 255, 255, 0.12)',
        tabBarItemStyle: {
          borderRadius: 8,
          marginHorizontal: 3,
          marginVertical: 3,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemibold,
          fontSize: 10.5,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen
        name="Rooms"
        component={RoomsStack}
        options={{
          tabBarIcon: ({ color, size }) => <RoomsIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingsStack}
        options={{
          tabBarIcon: ({ color, size }) => <BookingsIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="DailyOps"
        component={DailyOpsStack}
        options={{
          title: 'Daily Ops',
          tabBarIcon: ({ color, size }) => <DailyOpsIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Guests"
        component={GuestsStack}
        options={{
          tabBarIcon: ({ color, size }) => <GuestsIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Bills"
        component={BillsStack}
        options={{
          tabBarIcon: ({ color, size }) => <BillsIcon color={color} size={size} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Bills', {
              screen: 'BillsHome',
            });
          },
        })}
      />
      <Tab.Screen
        name="More"
        component={MoreStack}
        options={{
          tabBarIcon: ({ color, size }) => <MoreIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
